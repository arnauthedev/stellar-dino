"use client";

import { useState, useTransition } from "react";
import type { Flight } from "@/lib/stellar";
import { delayFlightAction, onTimeAction, reportFollowUpAction, resetDemoAction, resetGameAction, type ActionResult } from "./actions";

type LogEntry = ActionResult & { at: string };

const STATUS_BADGE: Record<Flight["status"], string> = {
  Scheduled: "badge",
  OnTime: "badge badge-good",
  Delayed: "badge badge-bad",
};

export function ControlPanel({ flights }: { flights: Flight[] }) {
  const [delay, setDelay] = useState(120);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [, startTransition] = useTransition();
  // The user's next flight that has not been reported yet (else their last one).
  const flight = flights.find((f) => f.status === "Scheduled") ?? flights[flights.length - 1];

  const act = (label: string, fn: () => Promise<ActionResult>) => {
    setBusy(label);
    startTransition(async () => {
      const r = await fn();
      setLog((l) => [{ ...r, at: new Date().toLocaleTimeString("en-GB") }, ...l].slice(0, 8));
      setBusy(null);
    });
  };

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      <section className="panel order-1 space-y-4 p-4 sm:p-5">
        <div className="label">Flight oracle · user&apos;s booked flight</div>
        {!flight ? (
          <p className="text-[15px] text-subtle">The user has no booked flight yet. Ask Dino to book one.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-ctl bg-accent-soft px-4 py-3">
              <span className="num text-lg font-medium">{flight.code}</span>
              <span className={`ml-auto sm:order-last ${STATUS_BADGE[flight.status]}`}>{flight.status === "OnTime" ? "On time" : flight.status}</span>
              <span className="w-full text-sm text-subtle sm:w-auto">
                {flight.from} → {flight.to} · {String(flight.date).slice(6, 8)}/{String(flight.date).slice(4, 6)} · {flight.depart}–{flight.arrive}
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="segments w-full sm:w-auto" role="tablist" aria-label="Delay">
                {[60, 120, 180].map((m) => (
                  <button key={m} className="segment min-h-11 flex-1 sm:flex-none" role="tab" aria-selected={delay === m} onClick={() => setDelay(m)}>
                    +{m / 60} h
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary min-h-12 w-full sm:w-auto"
                disabled={!!busy || flight.status !== "Scheduled"}
                onClick={() => act("delay", () => delayFlightAction(flight.id, delay))}
              >
                {busy === "delay" ? "Reporting…" : `Delay flight +${delay / 60} h`}
              </button>
              <button
                className="btn min-h-12 w-full sm:w-auto"
                disabled={!!busy || flight.status !== "Scheduled"}
                onClick={() => act("ontime", () => onTimeAction(flight.id))}
              >
                {busy === "ontime" ? "Reporting…" : "Landed on time"}
              </button>
            </div>
            {flight.status !== "Scheduled" && <p className="text-sm text-subtle">This flight is already reported. Reset the demo to run it again.</p>}
          </>
        )}
      </section>

      <section className="panel order-3 space-y-4 p-4 sm:p-5 lg:order-2">
        <div className="label">Demo</div>
        <div className="grid gap-3 sm:flex sm:flex-wrap">
          <button className="btn min-h-12 w-full sm:w-auto" disabled={!!busy} onClick={() => act("reset", resetDemoAction)}>
            {busy === "reset" ? "Resetting… (about a minute)" : "Reset demo"}
          </button>
          <button className="btn min-h-12 w-full sm:w-auto" disabled={!!busy} onClick={() => act("game", resetGameAction)}>
            {busy === "game" ? "Resetting…" : "Reset game"}
          </button>
          <button className="btn min-h-12 w-full sm:w-auto" disabled={!!busy} onClick={() => act("followup", reportFollowUpAction)}>
            {busy === "followup" ? "Sending…" : "Street report follow-up"}
          </button>
        </div>
        <p className="text-sm leading-relaxed text-subtle">
          Reset demo: flights back to scheduled, bookings and credit cleared, spending history cleared, wallet back to
          500 USDC and pool to 100 USDC. Reset game: removes all players and changes the join code. Street report follow-up: Dino asks whether the latest reported problem was fixed.
        </p>
      </section>

      <section className="panel order-2 p-4 sm:p-5 lg:order-3 lg:col-span-2">
        <div className="label mb-2">Log</div>
        {log.length === 0 ? (
          <p className="text-[15px] text-faint">No actions yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {log.map((l, i) => (
              <li key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-3">
                <span className="num flex-none text-xs text-faint sm:pt-0.5">{l.at}</span>
                <span className={`min-w-0 flex-1 break-words text-[15px] leading-snug ${l.ok ? "" : "text-bad"}`}>{l.message}</span>
                {l.explorerUrl && (
                  <a
                    className="flex min-h-11 flex-none items-center text-sm text-accent-ink underline sm:min-h-0"
                    href={l.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View tx ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
