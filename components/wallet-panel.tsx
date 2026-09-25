"use client";

import { useCallback, useEffect, useState } from "react";
import { userAmount } from "@/components/history-list";
import { useChainEvents } from "@/components/live";
import type { AgentState } from "@/lib/agent-state";
import type { HistoryRow } from "@/lib/stellar";

// Right column of the agent page: wallet (balance, credit, spending limit) and
// live activity. On smaller screens it opens as a drawer from the chat's pills.

const ICONS: Partial<Record<HistoryRow["kind"], string>> = {
  ticket_sold: "M3 13l7-2 4-7h2l-2 7 5 1 2-2h1l-1 4 1 4h-1l-2-2-5 1 2 7h-2l-4-7-7-2z", // plane
  delay_refund: "M12 19V5M5 12l7-7 7 7", // arrow up (money back)
  hold_released: "M5 12l5 5L20 7",
  museum_ticket_sold: "M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6z", // columns
  museum_rescheduled: "M4 7h16M4 7v13h16V7M8 3v4M16 3v4M9 14h6", // calendar
  product_sold: "M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0", // bag
  bottle_recycled: "M7 4h10l-1 16H8zM9 9h6", // bottle
};

function when(iso: string, now: number): string {
  const d = new Date(iso);
  const mins = now ? Math.round((now - d.getTime()) / 60_000) : Infinity;
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleTimeString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
}

function title(row: HistoryRow): string {
  // Short title from the readable note (the part before ":" when it has one).
  const n = row.note.replace(/^Airport shop: /, "");
  return n.split(/[:.](?=\s)/)[0].slice(0, 48);
}

export function WalletPanel({
  state,
  onEditLimit,
  onCollapse,
}: {
  state: AgentState;
  onEditLimit: () => void;
  /** Hide the panel (the Wallet pill in the chat brings it back). */
  onCollapse?: () => void;
}) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/history", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).rows ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);
  useChainEvents(() => load());

  const used = Math.min(1, state.limit.limit ? state.limit.spent / state.limit.limit : 0);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <section className="panel p-5">
        <div className="flex items-center justify-between">
          <div className="label">Wallet</div>
          {onCollapse && (
            <button className="icon-btn -mt-1 -mr-2 size-8!" onClick={onCollapse} aria-label="Hide wallet panel" title="Hide">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <strong className="num text-[34px] font-medium leading-none tracking-tight">{state.wallet.toFixed(2)}</strong>
          <span className="text-sm text-subtle">USDC</span>
        </div>
        <div className="mt-1 text-sm text-subtle">
          Recycling credit <b className="num font-medium text-ink">{state.credit.toFixed(2)}</b>
        </div>
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span className="text-subtle">Dino&apos;s daily spending limit</span>
          <span className="num font-medium">
            {state.limit.spent.toFixed(0)} / {state.limit.limit.toFixed(0)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
          <div className={`h-full rounded-full ${used > 0.85 ? "bg-bad" : "bg-good"}`} style={{ width: `${used * 100}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-subtle">{state.limit.remaining.toFixed(2)} USDC left today. Above that, payments are blocked.</p>
        <button className="btn mt-4 w-full" onClick={onEditLimit}>
          Edit limit
        </button>
      </section>

      <section className="panel flex min-h-0 flex-1 flex-col py-4">
        <div className="label px-5">Activity</div>
        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {rows === null && <li className="px-5 py-3 text-sm text-faint">Loading…</li>}
          {rows?.length === 0 && <li className="px-5 py-3 text-sm text-faint">No activity yet.</li>}
          {rows?.map((r) => {
            const amount = userAmount(r);
            return (
              <li key={r.id}>
                <a
                  href={r.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-field"
                  title={r.note}
                >
                  <span className={`flex size-9 flex-none items-center justify-center rounded-ctl ${amount?.tone === "text-good" ? "bg-good-soft text-good" : "bg-chip text-ink-soft"}`}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={ICONS[r.kind] ?? "M12 5v14M5 12h14"} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{title(r)}</span>
                    <span className="text-xs text-faint">
                      {when(r.at, now)} · <span className="text-accent-ink underline">View tx</span>
                    </span>
                  </span>
                  {amount && <span className={`num text-sm ${amount.tone}`}>{amount.text.replace(" credit", "")}</span>}
                </a>
              </li>
            );
          })}
        </ul>
        <p className="mx-4 mt-2 rounded-ctl bg-field px-3 py-2.5 text-xs text-subtle">
          Dino pays from this wallet only after you accept, and never above your daily limit.
        </p>
      </section>
    </div>
  );
}
