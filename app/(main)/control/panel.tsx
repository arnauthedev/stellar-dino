"use client";

import { useState, useTransition } from "react";
import type { Flight } from "@/lib/stellar";
import { delayFlightAction, onTimeAction, resetDemoAction, resetGameAction, type ActionResult } from "./actions";

type LogEntry = ActionResult & { at: string };

const STATUS_BADGE: Record<Flight["status"], string> = {
  Scheduled: "badge",
  OnTime: "badge badge-good",
  Delayed: "badge badge-bad",
};

export function ControlPanel({ flights, bookedFlight }: { flights: Flight[]; bookedFlight?: string }) {
  const [flightId, setFlightId] = useState(bookedFlight ?? flights[0]?.id ?? "");
  const [delay, setDelay] = useState(120);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [, startTransition] = useTransition();
  const flight = flights.find((f) => f.id === flightId);

  const act = (label: string, fn: () => Promise<ActionResult>) => {
    setBusy(label);
    startTransition(async () => {
      const r = await fn();
      setLog((l) => [{ ...r, at: new Date().toLocaleTimeString("en-GB") }, ...l].slice(0, 8));
      setBusy(null);
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="panel space-y-4 p-5">
        <div className="label">Flight oracle</div>
        <div className="space-y-2">
          {flights.map((f) => (
            <label
              key={f.id}
              className={`flex cursor-pointer items-center gap-3 rounded-ctl px-3 py-2.5 ${f.id === flightId ? "bg-accent-soft" : "bg-field"}`}
            >
              <input type="radio" name="flight" checked={f.id === flightId} onChange={() => setFlightId(f.id)} />
              <span className="num font-medium">{f.code}</span>
              <span className="text-sm text-subtle">
                {f.from} → {f.to} · {f.depart}–{f.arrive}
              </span>
              {f.id === bookedFlight && <span className="badge">booked</span>}
              <span className={`ml-auto ${STATUS_BADGE[f.status]}`}>{f.status === "OnTime" ? "On time" : f.status}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="segments" role="tablist" aria-label="Delay">
            {[60, 120, 180].map((m) => (
              <button key={m} className="segment" role="tab" aria-selected={delay === m} onClick={() => setDelay(m)}>
                +{m / 60} h
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            disabled={!!busy || flight?.status !== "Scheduled"}
            onClick={() => act("delay", () => delayFlightAction(flightId, delay))}
          >
            {busy === "delay" ? "Reporting…" : `Delay flight +${delay / 60} h`}
          </button>
          <button
            className="btn"
            disabled={!!busy || flight?.status !== "Scheduled"}
            onClick={() => act("ontime", () => onTimeAction(flightId))}
          >
            {busy === "ontime" ? "Reporting…" : "Landed on time"}
          </button>
        </div>
        {flight && flight.status !== "Scheduled" && (
          <p className="text-sm text-subtle">This flight is already reported. Reset the demo to run it again.</p>
        )}
      </section>

      <section className="panel space-y-4 p-5">
        <div className="label">Demo</div>
        <div className="flex flex-wrap gap-3">
          <button className="btn" disabled={!!busy} onClick={() => act("reset", resetDemoAction)}>
            {busy === "reset" ? "Resetting… (about a minute)" : "Reset demo"}
          </button>
          <button className="btn" disabled={!!busy} onClick={() => act("game", resetGameAction)}>
            {busy === "game" ? "Resetting…" : "Reset game"}
          </button>
        </div>
        <p className="text-sm text-subtle">
          Reset demo: flights back to scheduled, bookings and credit cleared, spending history cleared, wallet back to
          500 USDC and pool to 100 USDC. Reset game: removes all players and changes the join code.
        </p>
        <div>
          <div className="label mb-2">Log</div>
          {log.length === 0 ? (
            <p className="text-sm text-faint">No actions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {log.map((l, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num text-faint">{l.at}</span>
                  <span className={l.ok ? "" : "text-bad"}>{l.message}</span>
                  {l.explorerUrl && (
                    <a className="ml-auto flex-none text-accent-ink underline" href={l.explorerUrl} target="_blank" rel="noreferrer">
                      View tx
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
