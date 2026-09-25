import type { HistoryRow } from "@/lib/stellar";

const LABEL: Record<HistoryRow["kind"], string> = {
  product_sold: "Airport shop",
  subsidy_paid: "Recycling subsidy",
  bottle_recycled: "Recycling",
  pool_funded: "Government",
  product_added: "Airport shop",
  ticket_sold: "Airline",
  hold_released: "Airline",
  delay_refund: "Airline refund",
  museum_ticket_sold: "Museum",
  museum_rescheduled: "Museum",
};

/** Signed amount from the user's point of view, e.g. "-11.50" or "+24.00". */
export function userAmount(row: HistoryRow): { text: string; tone: string } | null {
  const d = row.data as Record<string, number>;
  switch (row.kind) {
    case "product_sold":
      return { text: `-${d.user_paid.toFixed(2)}`, tone: "text-ink" };
    case "ticket_sold":
      return { text: `-${d.price.toFixed(2)}`, tone: "text-ink" };
    case "museum_ticket_sold":
      return { text: `-${d.price.toFixed(2)}`, tone: "text-ink" };
    case "delay_refund":
      return { text: `+${d.amount.toFixed(2)}`, tone: "text-good" };
    case "bottle_recycled":
      return { text: `+${d.credit_added.toFixed(2)} credit`, tone: "text-good" };
    default:
      return null;
  }
}

function time(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/Lisbon",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryList({ rows, empty = "No transactions yet." }: { rows: HistoryRow[]; empty?: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-subtle">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const amount = userAmount(row);
        return (
          <li key={row.id} className="flex items-start gap-4 py-3.5">
            <div className="num w-[92px] flex-none pt-0.5 text-xs text-faint">{time(row.at)}</div>
            <div className="min-w-0 flex-1">
              <div className="label mb-0.5 text-[11px]!">{LABEL[row.kind]}</div>
              <div className="text-[15px] leading-snug">{row.note}</div>
              <a className="text-xs text-accent-ink underline" href={row.explorerUrl} target="_blank" rel="noreferrer">
                View on explorer
              </a>
            </div>
            {amount && <div className={`num flex-none pt-3 text-sm ${amount.tone}`}>{amount.text}</div>}
          </li>
        );
      })}
    </ul>
  );
}
