// Operations console: live state of every demo actor on Stellar testnet.
// Server component: fetches balances, stats and history, then renders a full-viewport grid.
import { AirlineIcon, GovernmentIcon, MuseumIcon, RecyclerIcon, ShopIcon, UserIcon } from "@/components/actor-icons";
import { userAmount } from "@/components/history-list";
import { LiveRefresh } from "@/components/live-refresh";
import { ACTORS, EXPLORER_URL } from "@/config/actors";
import { CONTRACTS } from "@/config/contracts";
import { getResetLedger } from "@/lib/demo";
import { getBalances, getCredit, getHistory, getSpendingLimit, getStats, type HistoryRow } from "@/lib/stellar";

const fmt = (n: number | null | undefined) =>
  n == null ? "–" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });

/** Dot colour per event kind, matching the colour of the counterparty actor. */
const KIND_DOT: Record<HistoryRow["kind"], string> = {
  product_sold: "bg-p-sand",
  product_added: "bg-faint",
  subsidy_paid: "bg-p-blue",
  pool_funded: "bg-p-blue",
  bottle_recycled: "bg-p-teal",
  ticket_sold: "bg-p-plum",
  hold_released: "bg-good",
  delay_refund: "bg-warn",
  museum_ticket_sold: "bg-p-violet",
  museum_rescheduled: "bg-p-violet/50",
};

type Amount = { text: string; tone: string } | null;
const num = (row: HistoryRow, key: string) => Number((row.data as Record<string, unknown>)[key] ?? 0);
const plus = (n: number): Amount => ({ text: `+${n.toFixed(2)}`, tone: "text-good" });
const minus = (n: number): Amount => ({ text: `-${n.toFixed(2)}`, tone: "text-ink" });

/** Signed amount from the point of view of the card's actor. */
function actorAmount(actor: ActorKey, row: HistoryRow): Amount {
  switch (actor) {
    case "user":
      return userAmount(row);
    case "government":
      if (row.kind === "subsidy_paid") return minus(num(row, "amount"));
      if (row.kind === "pool_funded") return { text: `${num(row, "amount").toFixed(2)} → pool`, tone: "text-ink" };
      return null;
    case "recycler":
      return row.kind === "bottle_recycled" ? { text: `+${num(row, "credit_added").toFixed(2)} cr`, tone: "text-good" } : null;
    case "shop":
      return row.kind === "product_sold" ? plus(num(row, "price")) : null;
    case "airline":
      if (row.kind === "ticket_sold") return plus(num(row, "paid_to_airline"));
      if (row.kind === "hold_released") return plus(num(row, "amount"));
      if (row.kind === "delay_refund") return minus(num(row, "amount"));
      return null;
    case "museum":
      return row.kind === "museum_ticket_sold" ? plus(num(row, "price")) : null;
  }
}

type ActorKey = "user" | "government" | "recycler" | "shop" | "airline" | "museum";

type StatItem = { label: string; value: React.ReactNode; muted?: boolean; tone?: string };

function Stats({ items, big }: { items: StatItem[]; big?: boolean }) {
  const cols = items.length >= 4 ? "grid-cols-2 sm:grid-cols-4" : items.length === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <dl className={`grid flex-none gap-px border-b border-[#e6e9ee] bg-[#e6e9ee] ${cols}`}>
      {items.map((s) => (
        <div key={s.label} className={`min-w-0 bg-white px-3.5 ${big ? "py-3.5" : "py-2.5"}`}>
          <dt className="text-[10px] leading-tight lg:truncate font-medium uppercase tracking-[0.09em] text-subtle">{s.label}</dt>
          <dd
            className={`num mt-0.5 truncate leading-tight ${big ? "text-[26px]" : "text-[17px]"} ${
              s.muted ? "text-faint" : (s.tone ?? "text-ink-strong")
            }`}
          >
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Address({ id, kind }: { id: string; kind: "account" | "contract" }) {
  return (
    <a
      className="num flex-none whitespace-nowrap rounded-md border border-[#e3e7ec] bg-[#f6f7f9] px-1.5 py-0.5 text-[11.5px] text-ink-soft transition-colors hover:border-[#cfd6df] hover:bg-white hover:text-accent-ink"
      href={`${EXPLORER_URL}/${kind}/${id}`}
      target="_blank"
      rel="noreferrer"
      title={id}
    >
      {short(id)}
    </a>
  );
}

function TxList({ actor, rows, limit, roomy }: { actor: ActorKey; rows: HistoryRow[]; limit: number; roomy?: boolean }) {
  const latest = rows.slice(-limit).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 flex-none items-center justify-between px-3.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-subtle">Latest transactions</span>
        <span className="num text-[11px] text-faint">{rows.length} since reset</span>
      </div>
      {latest.length === 0 ? (
        <p className="px-3.5 pb-3 text-[12.5px] text-faint">Nothing yet.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pb-1.5">
          {latest.map((r) => {
            const amount = actorAmount(actor, r);
            return (
              <li key={r.id}>
                <a
                  className={`group flex items-center gap-2.5 px-3.5 transition-colors hover:bg-[#f2f4f7] ${
                    roomy ? "min-h-11 py-2 lg:h-9 lg:min-h-0 lg:py-0" : "min-h-11 py-2 lg:h-8 lg:min-h-0 lg:py-0"
                  }`}
                  href={r.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open transaction on stellar.expert"
                >
                  <span className={`size-1.5 flex-none rounded-full ${KIND_DOT[r.kind]}`} aria-hidden="true" />
                  <span className={`line-clamp-2 min-w-0 flex-1 text-ink lg:line-clamp-1 group-hover:text-ink-strong ${roomy ? "text-[13.5px]" : "text-[12.5px]"}`}>
                    {r.note}
                  </span>
                  {amount && <span className={`num flex-none whitespace-nowrap text-[12px] ${amount.tone}`}>{amount.text}</span>}
                  <span className="num w-10 flex-none text-right text-[11.5px] text-faint group-hover:hidden">{hhmm(r.at)}</span>
                  <span className="hidden w-10 flex-none text-right text-[12px] text-accent-ink group-hover:inline" aria-hidden="true">
                    ↗
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Card({
  actor,
  name,
  role,
  icon,
  address,
  kind = "account",
  stats,
  extra,
  rows,
  limit = 4,
  className = "",
}: {
  actor: ActorKey;
  name: string;
  role: string;
  icon: React.ReactNode;
  address: string;
  kind?: "account" | "contract";
  stats: StatItem[];
  extra?: React.ReactNode;
  rows: HistoryRow[];
  limit?: number;
  className?: string;
}) {
  const big = actor === "user";
  const last = rows.at(-1);
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#dde2e8] bg-white ${className}`}>
      <header className={`flex flex-none items-center gap-2.5 border-b border-[#e6e9ee] px-3.5 ${big ? "h-12" : "h-10"}`}>
        <span className={`flex flex-none items-center justify-center ${big ? "h-6 w-7" : "h-[18px] w-5"}`}>{icon}</span>
        <h2 className={`flex-none font-semibold text-ink-strong ${big ? "text-[15px]" : "text-[13px]"}`}>{name}</h2>
        <p className="hidden min-w-0 flex-1 truncate text-[12px] text-subtle sm:block">{role}</p>
        <span
          className={`ml-auto size-1.5 flex-none rounded-full sm:ml-0 ${last ? "bg-good" : "bg-ground"}`}
          title={last ? `Last activity ${hhmm(last.at)}` : "No activity since reset"}
        />
        <Address id={address} kind={kind} />
      </header>
      <Stats items={stats} big={big} />
      {extra}
      <TxList actor={actor} rows={rows} limit={limit} roomy={big} />
    </section>
  );
}

function SpendBar({ spent, limit, periodHours }: { spent: number; limit: number; periodHours: number }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  return (
    <div className="flex-none border-b border-[#e6e9ee] px-3.5 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.09em] text-subtle">
          Spending limit<span className="hidden sm:inline"> · {periodHours} h window</span>
        </span>
        <span className="num whitespace-nowrap text-[12px] text-ink-soft">
          {fmt(spent)} / {fmt(limit)} <span className="text-faint">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#edf0f4]">
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-bad" : pct >= 60 ? "bg-warn" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Full-height operations console. The parent must be a flex column that gives it
 * the height to fill (e.g. h-dvh); on phones it simply stacks and scrolls.
 */
export async function ActorsConsole({ showHeader = true }: { showHeader?: boolean }) {
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
  const recycled = of("bottle_recycled");
  const lastRow = rows.at(-1);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#eef1f4]">
      <LiveRefresh />
      {showHeader && (
        <div className="flex h-11 flex-none items-center gap-3 border-b border-[#dde2e8] bg-white/70 px-3 sm:px-4">
          <h1 className="text-[13px] font-semibold tracking-tight text-ink-strong">Actors</h1>
          <span className="text-[10px] font-medium uppercase tracking-[0.09em] text-subtle">Operations console</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-subtle">
            <span className="size-1.5 animate-pulse rounded-full bg-good" aria-hidden="true" />
            Live · Stellar testnet
          </span>
          <span className="num hidden text-[11.5px] text-faint sm:inline">
            {lastRow ? `last tx ${hhmm(lastRow.at)}` : "no tx since reset"} · demo USDC
          </span>
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 p-2.5 sm:gap-3 sm:p-3 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-3">
        <Card
          actor="user"
          className="md:col-span-2 lg:row-span-2"
          name="User"
          role="Traveller · smart wallet with a spending limit"
          icon={<UserIcon className="h-full w-auto" />}
          address={CONTRACTS.wallet}
          kind="contract"
          limit={8}
          rows={rows.filter((r) => r.user === CONTRACTS.wallet && r.kind !== "subsidy_paid")}
          stats={[
            { label: "Balance", value: fmt(balances.wallet.usdc) },
            { label: "Recycling credit", value: fmt(credit), muted: credit === 0, tone: "text-good" },
            { label: "Spent", value: fmt(limit.spent) },
            { label: "Remaining", value: fmt(limit.remaining), muted: true },
          ]}
          extra={<SpendBar spent={limit.spent} limit={limit.limit} periodHours={limit.periodHours} />}
        />
        <Card
          actor="government"
          name="Government"
          role="Funds the recycling subsidy pool"
          icon={<GovernmentIcon className="h-full w-auto" />}
          address={ACTORS.government}
          rows={of("subsidy_paid", "pool_funded")}
          stats={[
            { label: "Pool", value: fmt(balances.pool) },
            { label: "Subsidies paid", value: fmt(stats.shop.subsidyPaid) },
            { label: "Treasury", value: fmt(usdc.government), muted: true },
          ]}
        />
        <Card
          actor="recycler"
          name="Recycling business"
          role="Runs the recycling machine"
          icon={<RecyclerIcon className="h-full w-auto" />}
          address={ACTORS.recycler}
          rows={recycled}
          stats={[
            { label: "Bottles processed", value: stats.shop.bottlesRecycled },
            { label: "Since reset", value: recycled.length, muted: recycled.length === 0 },
            { label: "Last bottle", value: recycled.length ? hhmm(recycled[recycled.length - 1].at) : "–", muted: true },
          ]}
        />
        <Card
          actor="shop"
          name="Airport shop"
          role="Water and products; sustainable ones marked"
          icon={<ShopIcon className="h-full w-auto" />}
          address={ACTORS.shop}
          rows={of("product_sold")}
          stats={[
            { label: "Balance", value: fmt(usdc.shop) },
            { label: "Products sold", value: stats.shop.productsSold },
            { label: "Bottles sold", value: stats.shop.bottlesSold, muted: true },
          ]}
        />
        <Card
          actor="airline"
          name="Skyscannerd"
          role="Airline · 20% held until landing"
          icon={<AirlineIcon className="h-full w-auto" />}
          address={ACTORS.airline}
          rows={of("ticket_sold", "hold_released", "delay_refund")}
          stats={[
            { label: "Balance", value: fmt(usdc.airline) },
            { label: "Tickets sold", value: stats.airline.ticketsSold },
            { label: `Refunds · ${stats.airline.refundsPaid}`, value: fmt(stats.airline.refunded), muted: stats.airline.refundsPaid === 0 },
            { label: "Held now", value: fmt(balances.airlineHeld), muted: balances.airlineHeld === 0, tone: "text-warn" },
          ]}
        />
        <Card
          actor="museum"
          name="Museums"
          role="Timed-entry tickets, free reschedule"
          icon={<MuseumIcon className="h-full w-auto" />}
          address={ACTORS.museum}
          rows={of("museum_ticket_sold", "museum_rescheduled")}
          stats={[
            { label: "Balance", value: fmt(usdc.museum) },
            { label: "Tickets sold", value: stats.museum.ticketsSold },
            { label: "Reschedules", value: stats.museum.reschedules, muted: true },
          ]}
        />
      </div>
    </div>
  );
}
