import { ACTORS, EXPLORER_URL, HORIZON_URL } from "@/config/actors";
import { CONTRACTS, USDC } from "@/config/contracts";
import { getBalances, getSpendingLimit } from "@/lib/stellar";
import { pingAI } from "@/lib/ai";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

async function checkSupabase(): Promise<Check> {
  try {
    const { error } = await getServerSupabase().auth.admin.listUsers({ perPage: 1 });
    return error ? { ok: false, detail: error.message } : { ok: true, detail: "connected" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkContracts() {
  try {
    const [balances, limit] = await Promise.all([getBalances(), getSpendingLimit()]);
    return { ok: true as const, wallet: balances.wallet.usdc, pool: balances.pool, limit };
  } catch (err) {
    return { ok: false as const, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function xlmBalance(address: string): Promise<string | null> {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${address}`, { cache: "no-store" });
    if (!res.ok) return null;
    const account: { balances: { asset_type: string; balance: string }[] } = await res.json();
    return account.balances.find((b) => b.asset_type === "native")?.balance ?? null;
  } catch {
    return null;
  }
}

function Status({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "font-bold text-green-700" : "font-bold text-red-700"}>
      {ok ? "OK" : "FAIL"}
    </span>
  );
}

export default async function HealthPage() {
  const actors = Object.entries(ACTORS);
  const [supabase, ai, contracts, balances] = await Promise.all([
    checkSupabase(),
    pingAI(),
    checkContracts(),
    Promise.all(actors.map(([, address]) => xlmBalance(address))),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-6 font-mono text-sm">
      <h1 className="mb-6 text-2xl font-bold">Health</h1>

      <section className="mb-6 space-y-1">
        <p>
          Supabase: <Status ok={supabase.ok} /> <span className="text-gray-500">{supabase.detail}</span>
        </p>
        <p>
          OpenAI ({process.env.AI_MODEL}): <Status ok={ai.ok} />{" "}
          <span className="text-gray-500">{ai.detail}</span>
        </p>
      </section>

      <h2 className="mb-2 text-lg font-bold">Contracts</h2>
      <section className="mb-6 space-y-1">
        <p>
          Contracts: <Status ok={contracts.ok} />{" "}
          {contracts.ok ? (
            <span className="text-gray-500">
              wallet {contracts.wallet} USDC · recycling pool {contracts.pool} USDC · limit {contracts.limit.spent}/
              {contracts.limit.limit} USDC per {contracts.limit.periodHours} h
            </span>
          ) : (
            <span className="text-gray-500">{contracts.detail}</span>
          )}
        </p>
        {Object.entries({ usdc: USDC.contract, ...CONTRACTS }).map(([name, id]) => (
          <p key={name} className="break-all">
            {name}:{" "}
            <a className="underline" href={`${EXPLORER_URL}/contract/${id}`} target="_blank">
              {id}
            </a>
          </p>
        ))}
      </section>

      <h2 className="mb-2 text-lg font-bold">Stellar testnet actors</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-4">Actor</th>
            <th className="py-1 pr-4">Address</th>
            <th className="py-1 text-right">XLM</th>
          </tr>
        </thead>
        <tbody>
          {actors.map(([name, address], i) => (
            <tr key={name} className="border-b">
              <td className="py-1 pr-4">{name}</td>
              <td className="break-all py-1 pr-4">
                <a className="underline" href={`${EXPLORER_URL}/account/${address}`} target="_blank">
                  {address}
                </a>
              </td>
              <td className="py-1 text-right">
                {balances[i] ?? <span className="font-bold text-red-700">not funded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
