import "server-only";
import { createHash } from "node:crypto";
import { BASE_FEE, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ACTORS, HORIZON_URL } from "@/config/actors";
import { CONTRACTS, USDC } from "@/config/contracts";
import { fromUsdc, invoke, keypair, sv, txUrl, type TxResult } from "@/lib/stellar/core";
import { REPORT_REWARD_USDC, type Report } from "@/lib/report/types";

// Stellar TESTNET side of a submitted report: an on-chain fingerprint (classic tx
// with manageData + memo, since Soroban txs cannot carry memos) and a civic reward.

const horizon = new Horizon.Server(HORIZON_URL);

/** sha256 of the canonical report JSON (fixed key order). */
export function reportFingerprint(r: Pick<Report, "id" | "reference" | "category" | "description_pt" | "lat" | "lng" | "created_at">): Buffer {
  const canonical = JSON.stringify({
    id: r.id,
    reference: r.reference,
    category: r.category,
    description_pt: r.description_pt,
    lat: r.lat,
    lng: r.lng,
    created_at: r.created_at,
  });
  return createHash("sha256").update(canonical, "utf8").digest();
}

let anchorQueue: Promise<unknown> = Promise.resolve();

/** Classic tx from the user account: manageData("NMR <ref>", hash) + memo "Report <ref>". */
export function anchorFingerprint(reference: string, fingerprint: Buffer): Promise<{ txHash: string; explorerUrl: string }> {
  const run = anchorQueue.then(async () => {
    const kp = keypair("user");
    const name = `NMR ${reference}`.slice(0, 64);
    const memo = `Report ${reference}`.slice(0, 28);
    for (let attempt = 0; ; attempt++) {
      try {
        const account = await horizon.loadAccount(kp.publicKey());
        const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
          .addOperation(Operation.manageData({ name, value: fingerprint }))
          .addMemo(Memo.text(memo))
          .setTimeout(60)
          .build();
        tx.sign(kp);
        const res = await horizon.submitTransaction(tx);
        return { txHash: res.hash, explorerUrl: txUrl(res.hash) };
      } catch (err) {
        // Retry once on a sequence clash (another tx from the same account).
        const codes = JSON.stringify((err as { response?: { data?: unknown } })?.response?.data ?? "");
        if (attempt === 0 && /tx_bad_seq/.test(codes)) continue;
        throw new Error(`Fingerprint tx failed: ${codes.includes("result_codes") ? codes.slice(0, 200) : err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  anchorQueue = run.catch(() => undefined);
  return run;
}

/** Government pays the civic reward (USDC) to the user's smart wallet. */
export function payCivicReward(): Promise<TxResult> {
  return invoke({
    source: "government",
    contract: USDC.contract,
    method: "transfer",
    args: [sv.address(ACTORS.government), sv.address(CONTRACTS.wallet), sv.i128(fromUsdc(REPORT_REWARD_USDC))],
  });
}
