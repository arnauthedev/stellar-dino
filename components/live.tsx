"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { HistoryRow } from "@/lib/stellar";

// One chain-event poller per tab (every 3 s) + the toast stack.
// Pages subscribe to refresh their data; the Dino companion reacts to events.
// Toasts go to the top stack, unless a sink is registered (the Dino companion
// registers one and shows them as speech bubbles).

export type Toast = { id: string; text: string; href?: string; tone?: "good" | "warn" | "bad" | "neutral" };

type LiveContext = {
  subscribe: (fn: (rows: HistoryRow[]) => void) => () => void;
  toast: (t: Omit<Toast, "id">) => void;
  sink: (fn: (t: Toast) => void) => () => void;
};

const Ctx = createContext<LiveContext | null>(null);

export function useLive(): LiveContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLive must be used inside <LiveProvider>");
  return ctx;
}

/** Call fn whenever new chain events arrive. */
export function useChainEvents(fn: (rows: HistoryRow[]) => void) {
  const { subscribe } = useLive();
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => subscribe((rows) => ref.current(rows)), [subscribe]);
}

/** Receive toasts instead of the top stack while mounted (latest registered sink wins). */
export function useToastSink(fn: (t: Toast) => void) {
  const ctx = useContext(Ctx);
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const sink = ctx?.sink;
  useEffect(() => sink?.((t) => ref.current(t)), [sink]);
}

const TOAST_KINDS: Partial<Record<HistoryRow["kind"], Toast["tone"]>> = {
  delay_refund: "warn",
  hold_released: "good",
  ticket_sold: "neutral",
  museum_ticket_sold: "neutral",
  museum_rescheduled: "neutral",
  product_sold: "neutral",
  bottle_recycled: "good",
  pool_funded: "neutral",
};

function toastText(row: HistoryRow): string {
  if (row.kind === "delay_refund") {
    const hours = Number(row.data.delay_minutes) / 60;
    const delay = Number.isInteger(hours) ? `${hours} h` : `${row.data.delay_minutes} min`;
    return `Flight delayed ${delay}. ${row.amount?.toFixed(2)} USDC refunded.`;
  }
  return row.note;
}

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const listeners = useRef(new Set<(rows: HistoryRow[]) => void>());
  const sinks = useRef<((t: Toast) => void)[]>([]);

  const sink = useCallback((fn: (t: Toast) => void) => {
    sinks.current = [...sinks.current, fn];
    return () => void (sinks.current = sinks.current.filter((f) => f !== fn));
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    const target = sinks.current[sinks.current.length - 1];
    if (target) return target({ ...t, id });
    setToasts((all) => [...all.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 7000);
  }, []);

  const subscribe = useCallback((fn: (rows: HistoryRow[]) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  // Dev-only hook to try toasts from the console: __dinoToast("Hello", "good")
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __dinoToast?: (text: string, tone?: Toast["tone"], href?: string) => void };
    w.__dinoToast = (text, tone = "neutral", href) => toast({ text, tone, href });
    return () => void delete w.__dinoToast;
  }, [toast]);

  useEffect(() => {
    let cursor: string | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        if (res.ok) {
          const data: { rows: HistoryRow[]; cursor: string } = await res.json();
          const isFirst = cursor === undefined;
          cursor = data.cursor || cursor;
          if (!isFirst && data.rows.length) {
            for (const row of data.rows) {
              const tone = TOAST_KINDS[row.kind];
              if (tone) toast({ text: toastText(row), href: row.explorerUrl, tone });
            }
            listeners.current.forEach((fn) => fn(data.rows));
          }
        }
      } catch {
        // network hiccup: try again next tick
      }
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [toast]);

  return (
    <Ctx.Provider value={{ subscribe, toast, sink }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="toast pointer-events-auto flex max-w-[min(92vw,640px)] items-start gap-3 rounded-3xl animate-[toast-in_.25s_ease-out] leading-snug shadow-[var(--shadow-dialog)]"
          >
            <span
              className={`mt-1.5 size-2 flex-none rounded-full ${
                t.tone === "good" ? "bg-good" : t.tone === "warn" ? "bg-warn" : t.tone === "bad" ? "bg-bad" : "bg-accent"
              }`}
            />
            <span className="min-w-0 break-words">{t.text}</span>
            {t.href && (
              <a className="flex-none text-accent-ink underline" href={t.href} target="_blank" rel="noreferrer">
                View tx
              </a>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
