import { HistoryList } from "@/components/history-list";
import { LiveRefresh } from "@/components/live-refresh";
import { getResetLedger } from "@/lib/demo";
import { getHistory } from "@/lib/stellar";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const { rows } = await getHistory({ scope: "user", sinceLedger: await getResetLedger() });
  // subsidy_paid is already part of its purchase row; pool funding is not the user's.
  const mine = rows.filter((r) => r.kind !== "subsidy_paid" && r.kind !== "pool_funded").reverse();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-6">
      <LiveRefresh />
      <div className="mb-5 mt-4">
        <h1 className="title text-3xl">History</h1>
        <p className="text-sm text-subtle">Every payment made from your wallet, verifiable on the Stellar testnet explorer.</p>
      </div>
      <section className="panel px-5">
        <HistoryList rows={mine} empty="No transactions yet. Ask Dino to book a trip." />
      </section>
    </main>
  );
}
