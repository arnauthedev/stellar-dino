import "server-only";
import {
  Address,
  authorizeEntry,
  BASE_FEE,
  Contract,
  hash,
  inspectAuthEntry,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { ACTORS, EXPLORER_URL } from "@/config/actors";
import { CONTRACTS, NETWORK_PASSPHRASE, RPC_URL, USDC, WALLET_RULES } from "@/config/contracts";

// Low-level Stellar TESTNET plumbing: keys, reads, submitting transactions and
// signing auth for the user's OpenZeppelin smart wallet.

export const server = new rpc.Server(RPC_URL);
export const UNIT = BigInt(10) ** BigInt(USDC.decimals);

export type Signer = "user" | "government" | "recycler" | "shop" | "airline" | "museum" | "oracle" | "issuer" | "agent";

const SECRET_ENV: Record<Signer, string> = {
  user: "STELLAR_USER_SECRET",
  government: "STELLAR_GOV_SECRET",
  recycler: "STELLAR_RECYCLER_SECRET",
  shop: "STELLAR_SHOP_SECRET",
  airline: "STELLAR_AIRLINE_SECRET",
  museum: "STELLAR_MUSEUM_SECRET",
  oracle: "STELLAR_ORACLE_SECRET",
  issuer: "STELLAR_ISSUER_SECRET",
  agent: "STELLAR_AGENT_SECRET",
};

export function keypair(who: Signer): Keypair {
  const secret = process.env[SECRET_ENV[who]];
  if (!secret) throw new Error(`${SECRET_ENV[who]} is not set`);
  return Keypair.fromSecret(secret);
}

export function txUrl(txHash: string): string {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

/* ---------- ScVal helpers ---------- */

export const sv = {
  address: (a: string) => new Address(a).toScVal(),
  symbol: (s: string) => xdr.ScVal.scvSymbol(s),
  u32: (n: number) => xdr.ScVal.scvU32(n),
  bool: (b: boolean) => xdr.ScVal.scvBool(b),
  i128: (n: bigint) => nativeToScVal(n, { type: "i128" }),
  string: (s: string) => xdr.ScVal.scvString(s),
  vecU32: (ns: number[]) => xdr.ScVal.scvVec(ns.map((n) => xdr.ScVal.scvU32(n))),
};

/** stroops (bigint | string) -> USDC number, e.g. 120000000n -> 12 */
export function toUsdc(stroops: bigint | string | number): number {
  return Number(BigInt(stroops)) / Number(UNIT);
}

export function fromUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 100)) * (UNIT / BigInt(100));
}

/* ---------- Reads (simulation only) ---------- */

export async function readRaw(contractId: string, method: string, ...args: xdr.ScVal[]): Promise<xdr.ScVal> {
  // Any existing account works as the simulated source.
  const account = await server.getAccount(ACTORS.agent);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${friendlyError(sim.error)}`);
  return sim.result!.retval;
}

export async function read<T = unknown>(contractId: string, method: string, ...args: xdr.ScVal[]): Promise<T> {
  return scValToNative(await readRaw(contractId, method, ...args)) as T;
}

/* ---------- Smart wallet auth ---------- */

type WalletKey = "agent" | "user";

/** Contexts passed to __check_auth, in the host's depth-first order. */
function flattenInvocation(inv: xdr.SorobanAuthorizedInvocation): string[] {
  const fn = inv.function;
  const contract =
    fn.type === "sorobanAuthorizedFunctionTypeContractFn"
      ? Address.fromScAddress(fn.contractFn.contractAddress).toString()
      : "create";
  return [contract, ...inv.subInvocations.flatMap(flattenInvocation)];
}

function ruleFor(contract: string, key: WalletKey): number {
  if (key === "user") return WALLET_RULES.owner;
  if (contract === USDC.contract) return WALLET_RULES.usdc;
  if (contract === CONTRACTS.shop) return WALLET_RULES.shop;
  if (contract === CONTRACTS.airline) return WALLET_RULES.airline;
  if (contract === CONTRACTS.museum) return WALLET_RULES.museum;
  throw new Error(`The agent key has no wallet rule for contract ${contract}`);
}

function isWalletEntry(entry: xdr.SorobanAuthorizationEntry): boolean {
  return inspectAuthEntry(entry).address === CONTRACTS.wallet;
}

/**
 * Sign a smart-wallet auth entry. OpenZeppelin smart accounts expect
 * signature = AuthPayload { context_rule_ids, signers: Map<Signer, Bytes> }
 * and signers sign sha256(signature_payload || xdr(context_rule_ids)).
 */
function signWalletEntry(entry: xdr.SorobanAuthorizationEntry, key: WalletKey, validUntil: number) {
  const ruleIds = flattenInvocation(entry.rootInvocation).map((c) => ruleFor(c, key));
  const kp = keypair(key);
  return authorizeEntry(
    entry,
    async (_preimage, payload) => {
      const digest = hash(Buffer.concat([Buffer.from(payload), Buffer.from(sv.vecU32(ruleIds).toXDR())]));
      const signer = xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol("External"),
        sv.address(CONTRACTS.verifier),
        xdr.ScVal.scvBytes(kp.rawPublicKey()),
      ]);
      // contracttype struct -> ScMap with keys sorted by name
      const signatureScVal = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: sv.symbol("context_rule_ids"), val: sv.vecU32(ruleIds) }),
        new xdr.ScMapEntry({
          key: sv.symbol("signers"),
          val: xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: signer, val: xdr.ScVal.scvBytes(kp.sign(digest)) })]),
        }),
      ]);
      return { signatureScVal };
    },
    validUntil,
    NETWORK_PASSPHRASE,
  );
}

/* ---------- Writes ---------- */

export type TxResult<T = unknown> = { txHash: string; explorerUrl: string; result: T };

// Serialize transactions per source account (avoids sequence number clashes).
const queues = new Map<string, Promise<unknown>>();
function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  return next;
}

export type InvokeOptions = {
  /** Account that submits and pays fees; its auth is the transaction signature. */
  source: Signer;
  contract: string;
  method: string;
  args?: xdr.ScVal[];
  /** Which key signs for the smart wallet, if the call needs wallet auth. */
  walletKey?: WalletKey;
  /** Readable messages for this contract's error codes. */
  errors?: Record<number, string>;
};

export function invoke<T = unknown>(opts: InvokeOptions): Promise<TxResult<T>> {
  return serialized(opts.source, () => invokeNow<T>(opts));
}

async function invokeNow<T>({ source, contract, method, args = [], walletKey, errors }: InvokeOptions): Promise<TxResult<T>> {
  const kp = keypair(source);
  const build = async (op: xdr.Operation) => {
    const account = await server.getAccount(kp.publicKey());
    // Note: Soroban transactions cannot carry memos; readable notes live in contract events.
    return new TransactionBuilder(account, { fee: (Number(BASE_FEE) * 10).toString(), networkPassphrase: NETWORK_PASSPHRASE })
      .addOperation(op)
      .setTimeout(60)
      .build();
  };

  let tx = await build(new Contract(contract).call(method, ...args));
  let sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`${method} failed: ${friendlyError(sim.error, errors)}`);

  const auth = sim.result?.auth ?? [];
  if (auth.some(isWalletEntry)) {
    if (!walletKey) throw new Error(`${method} needs smart wallet auth`);
    const { sequence } = await server.getLatestLedger();
    const signed = await Promise.all(
      auth.map((entry) => (isWalletEntry(entry) ? signWalletEntry(entry, walletKey, sequence + 60) : entry)),
    );
    // Re-simulate with the signed auth so __check_auth and policies are metered.
    tx = await build(Operation.invokeContractFunction({ contract, function: method, args, auth: signed }));
    sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${method} failed: ${friendlyError(sim.error, errors)}`);
  }

  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") throw new Error(`${method} rejected: ${sent.errorResult?.toJSON() ? JSON.stringify(sent.errorResult.toJSON()).slice(0, 200) : "error"}`);

  const done = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (done.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`${method} failed on chain (${done.status}). Tx ${sent.hash}`);
  }
  const retval = done.returnValue;
  return { txHash: sent.hash, explorerUrl: txUrl(sent.hash), result: (retval ? scValToNative(retval) : undefined) as T };
}

/** Wallet / policy errors (OpenZeppelin codes) apply to every wallet call. */
const WALLET_ERRORS: Record<number, string> = {
  3221: "Spending limit exceeded",
  3223: "Not allowed by the wallet policy",
};

/** Map a contract error code to readable text. */
export function friendlyError(raw: string, errors: Record<number, string> = {}): string {
  const code = Number(raw.match(/Error\(Contract, #(\d+)\)/)?.[1]);
  if (code) return WALLET_ERRORS[code] ?? errors[code] ?? `contract error #${code}`;
  if (/resulting balance is not within the allowed range|balance/i.test(raw)) return "Insufficient USDC balance";
  return raw.split("\n")[0].slice(0, 200);
}
