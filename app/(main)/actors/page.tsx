import { ACTORS, EXPLORER_URL } from "@/config/actors";
import { CONTRACTS } from "@/config/contracts";
import { LiveRefresh } from "@/components/live-refresh";
import { DinoSprite } from "@/components/pixel";
import { getResetLedger } from "@/lib/demo";
import { getBalances, getCredit, getHistory, getSpendingLimit, getStats, type HistoryRow } from "@/lib/stellar";

export const metadata = { title: "Actors · Stellar Dino" };

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function Stat({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label text-[11px]!">{label}</span>
      <strong className={`num text-xl font-medium ${muted ? "text-faint" : ""}`}>{value}</strong>
    </div>
  );
}

function Card({
  name,
  role,
  color,
  address,
  kind = "account",
  stats,
  rows,
}: {
  name: string;
  role: string;
  color: string;
  address: string;
  kind?: "account" | "contract";
  stats: React.ReactNode;
  rows: HistoryRow[];
}) {
  return (
    <section className="panel flex flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <DinoSprite color={color} className="h-9 w-auto flex-none" label={name} />
        <div className="min-w-0">
          <h2 className="text-[17px] font-medium leading-tight">{name}</h2>
          <p className="text-xs text-subtle">{role}</p>
        </div>
        <a
          className="num ml-auto rounded-full bg-chip px-2.5 py-1 text-xs text-ink-soft hover:bg-muted-hover"
          href={`${EXPLORER_URL}/${kind}/${address}`}
          target="_blank"
          rel="noreferrer"
          title={address}
        >
          {short(address)}
        </a>
      </header>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{stats}</div>
      <div className="mt-auto">
        <div className="label mb-1.5 text-[11px]!">Latest</div>
        {rows.length === 0 ? (
          <p className="text-sm text-faint">Nothing yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(-3).reverse().map((r) => (
              <li key={r.id} className="text-[13px] leading-snug">
                <a className="hover:underline" href={r.explorerUrl} target="_blank" rel="noreferrer">
                  {r.note}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default async function ActorsPage() {
  const sinceLedger = await getResetLedger();
  const [balances, stats, { rows }, credit, limit] = await Promise.all([
    getBalances(),
    getStats(),
    getHistory({ scope: "all", sinceLedger }),
    getCredit(),
    getSpendingLimit(),
  ]);
  const usdc = Object.fromEntries(balances.actors.map((a) => [a.name, a.usdc]));
  const of = (...kinds: HistoryRow["kind"][]) => rows.filter((r) => kinds.includes(r.kind));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <LiveRefresh />
      <div className="mb-6 mt-8">
        <h1 className="title text-3xl">Actors</h1>
        <p className="text-sm text-subtle">Live balances on Stellar testnet. Amounts in demo USDC.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card
          name="User"
          role="Traveller · smart wallet with a spending limit"
          color="var(--color-dino)"
          address={CONTRACTS.wallet}
          kind="contract"
          rows={rows.filter((r) => r.user === CONTRACTS.wallet && r.kind !== "subsidy_paid")}
          stats={
            <>
              <Stat label="Balance" value={fmt(balances.wallet.usdc)} />
              <Stat label="Recycling credit" value={fmt(credit)} muted={credit === 0} />
              <Stat label="Spent today" value={fmt(limit.spent)} />
              <Stat label="Daily limit" value={fmt(limit.limit)} muted />
            </>
          }
        />
        <Card
          name="Government"
          role="Funds the recycling subsidy pool"
          color="var(--color-p-blue)"
          address={ACTORS.government}
          rows={of("subsidy_paid", "pool_funded")}
          stats={
            <>
              <Stat label="Pool balance" value={fmt(balances.pool)} />
              <Stat label="Subsidies paid" value={fmt(stats.shop.subsidyPaid)} />
              <Stat label="Treasury" value={fmt(usdc.government)} muted />
            </>
          }
        />
        <Card
          name="Recycling business"
          role="Runs the recycling machine"
          color="var(--color-p-teal)"
          address={ACTORS.recycler}
          rows={of("bottle_recycled")}
          stats={
            <>
              <Stat label="Bottles processed" value={stats.shop.bottlesRecycled} />
            </>
          }
        />
        <Card
          name="Airport shop"
          role="Sells water and products; marks sustainable ones"
          color="var(--color-p-sand)"
          address={ACTORS.shop}
          rows={of("product_sold")}
          stats={
            <>
              <Stat label="Balance" value={fmt(usdc.shop)} />
              <Stat label="Products sold" value={stats.shop.productsSold} />
              <Stat label="Bottles sold" value={stats.shop.bottlesSold} muted />
            </>
          }
        />
        <Card
          name="Skyscannerd"
          role="Airline · sells tickets; 20% held until landing"
          color="var(--color-p-plum)"
          address={ACTORS.airline}
          rows={of("ticket_sold", "hold_released", "delay_refund")}
          stats={
            <>
              <Stat label="Balance" value={fmt(usdc.airline)} />
              <Stat label="Tickets sold" value={stats.airline.ticketsSold} />
              <Stat label="Refunds paid" value={`${stats.airline.refundsPaid} · ${fmt(stats.airline.refunded)}`} />
              <Stat label="Held now" value={fmt(balances.airlineHeld)} muted={balances.airlineHeld === 0} />
            </>
          }
        />
        <Card
          name="Museum"
          role="Timed-entry tickets, free reschedule"
          color="var(--color-p-violet)"
          address={ACTORS.museum}
          rows={of("museum_ticket_sold", "museum_rescheduled")}
          stats={
            <>
              <Stat label="Balance" value={fmt(usdc.museum)} />
              <Stat label="Tickets sold" value={stats.museum.ticketsSold} />
              <Stat label="Reschedules" value={stats.museum.reschedules} muted />
            </>
          }
        />
      </div>
    </main>
  );
}
