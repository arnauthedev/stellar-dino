"use client";

import type { Card, FlightOption, ProductOption } from "@/lib/agent/cards";

// Overlay cards for Dino's proposals and option lists (shown over the chat).

/** Parody airline wordmark with a small pixel plane (our own style). */
export function SkyscannerdLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <svg viewBox="0 0 14 9" className="pixelated h-3.5 w-auto" aria-hidden="true">
        <g fill="var(--color-accent)">
          <rect x="0" y="4" width="14" height="2" />
          <rect x="5" y="0" width="2" height="9" />
          <rect x="6" y="1" width="2" height="7" />
          <rect x="0" y="2" width="2" height="4" />
          <rect x="12" y="3" width="2" height="1" />
        </g>
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.03em] text-accent-ink">
        skyscanner<span className="text-accent">d</span>
      </span>
    </span>
  );
}

export type CardAction =
  | { type: "accept"; card: Card }
  | { type: "reject"; card: Card }
  | { type: "pick"; card: Card }
  | { type: "ask"; text: string };

const usd = (n: number) => n.toFixed(2);

function Row({ label, value, sub }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-subtle">{label}</span>
      <span className="text-right">
        <span className="num">{value}</span>
        {sub && <span className="block text-xs text-faint">{sub}</span>}
      </span>
    </div>
  );
}

function FlightLine({ f, big }: { f: FlightOption; big?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <div>
        <div className={`num ${big ? "text-3xl" : "text-xl"} font-medium`}>{f.depart}</div>
        <div className="text-xs text-subtle">
          {f.from} · {f.fromCity}
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center text-[11px] text-faint">
        <span className="num">
          {f.code} · {f.dateLabel}
        </span>
        <div className="my-1 h-px w-full bg-line" />
        <span>direct</span>
      </div>
      <div className="text-right">
        <div className={`num ${big ? "text-3xl" : "text-xl"} font-medium`}>{f.arrive}</div>
        <div className="text-xs text-subtle">
          {f.to} · {f.toCity}
        </div>
      </div>
    </div>
  );
}

export function CardView({
  card,
  busy,
  onAction,
  onClose,
}: {
  card: Card;
  busy: boolean;
  onAction: (a: CardAction) => void;
  onClose: () => void;
}) {
  const proposal = card.kind === "proposal" || card.kind === "product";
  const showsAirline = (card.kind === "proposal" && card.flights.length > 0) || card.kind === "flights";
  const heading =
    card.kind === "product" || card.kind === "products"
      ? "Airport shop"
      : card.kind === "museums"
        ? `Museums in Lisbon · ${card.dateLabel}`
        : card.kind === "museum_slots"
          ? `${card.name} · ${card.dateLabel}`
          : card.kind === "flights"
            ? card.dateLabel
            : "Your plan";

  return (
    <div className="card flex max-h-full w-full max-w-xl flex-col overflow-hidden animate-[pop-in_.22s_ease-out]">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {showsAirline && <SkyscannerdLogo />}
          <span className="label truncate">{heading}</span>
        </div>
        <button className="icon-btn size-9!" onClick={onClose} aria-label="Close card">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {card.kind === "proposal" && (
          <div className="space-y-5">
            {card.flights.map((f) => (
              <FlightLine key={f.id} f={f} big={card.flights.length === 1} />
            ))}
            <div className="rounded-ctl bg-field px-4 py-2">
              {card.flights.map((f) => (
                <Row key={f.id} label={`${card.airline} ${f.code} · ${f.dateLabel}`} value={`${usd(f.price)} USDC`} sub={`${usd(f.held)} held until landing, refunded if late`} />
              ))}
              {card.museums.map((m) => (
                <Row
                  key={`${m.museumId}-${m.date}`}
                  label={
                    <>
                      {m.name} · {m.dateLabel} {m.time}
                      <span className="block text-xs text-faint">{m.style}</span>
                    </>
                  }
                  value={m.reschedule ? "move, free" : `${usd(m.price)} USDC`}
                />
              ))}
              <div className="mt-1 border-t border-line pt-1">
                <Row label="Total" value={<b className="font-medium">{usd(card.total)} USDC</b>} sub={Number.isFinite(card.limitLeft) ? `${usd(card.limitLeft)} left in today's limit` : undefined} />
              </div>
            </div>
          </div>
        )}

        {card.kind === "product" && <ProductBlock p={card.product} credit={card.credit} big />}

        {card.kind === "flights" && (
          <ul className="space-y-2">
            {card.options.length === 0 && <p className="text-sm text-subtle">No flights available.</p>}
            {card.options.map((f) => (
              <li key={f.id}>
                <button
                  className="w-full rounded-ctl bg-field px-4 py-3 text-left hover:bg-muted-hover"
                  disabled={busy}
                  onClick={() =>
                    onAction({ type: "pick", card: { kind: "proposal", airline: card.airline, flights: [f], museums: [], total: f.price, limitLeft: NaN } })
                  }
                >
                  <FlightLine f={f} />
                  <div className="mt-1 text-right text-sm">
                    <span className="num font-medium">{usd(f.price)} USDC</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {card.kind === "museums" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {card.options.map((m) => (
              <li key={m.id}>
                <button
                  className="h-full w-full rounded-ctl bg-field px-4 py-3 text-left hover:bg-muted-hover"
                  disabled={busy}
                  onClick={() => onAction({ type: "ask", text: `Show me the times for ${m.name} on ${card.dateLabel}.` })}
                >
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-subtle">{m.style}</div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-faint">{m.minutesFromAirport} min from airport</span>
                    <span className="num">{usd(m.price)} USDC</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {card.kind === "museum_slots" && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {card.options.length === 0 && <p className="col-span-full text-sm text-subtle">No free slots.</p>}
            {card.options.map((s) => (
              <button
                key={s.time}
                className="num rounded-ctl bg-field px-3 py-3 text-center text-lg hover:bg-muted-hover"
                disabled={busy}
                onClick={() =>
                  onAction({
                    type: "pick",
                    card: {
                      kind: "proposal",
                      airline: "",
                      flights: [],
                      museums: [
                        { museumId: card.museumId, name: card.name, style: card.style, date: card.date, dateLabel: card.dateLabel, time: s.time, price: card.reschedule ? 0 : card.price, reschedule: card.reschedule },
                      ],
                      total: card.reschedule ? 0 : card.price,
                      limitLeft: NaN,
                    },
                  })
                }
              >
                {s.time}
              </button>
            ))}
          </div>
        )}

        {card.kind === "products" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {card.options.map((p) => (
              <li key={p.id}>
                <button
                  className="h-full w-full rounded-ctl bg-field px-4 py-3 text-left hover:bg-muted-hover"
                  disabled={busy}
                  onClick={() => onAction({ type: "pick", card: { kind: "product", product: p, credit: card.credit, limitLeft: NaN } })}
                >
                  <ProductBlock p={p} credit={card.credit} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {proposal && (
        <div className="flex gap-3 border-t border-line px-6 py-4">
          <button className="btn flex-1" disabled={busy} onClick={() => onAction({ type: "reject", card })}>
            Reject
          </button>
          <button className="btn btn-primary flex-[2]" disabled={busy} onClick={() => onAction({ type: "accept", card })}>
            {busy ? "Paying from your wallet…" : card.kind === "proposal" && card.total === 0 ? "Accept (free)" : "Accept & pay"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductBlock({ p, credit, big }: { p: ProductOption; credit: number; big?: boolean }) {
  const discounted = p.youPay < p.price;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className={big ? "text-2xl font-medium" : "font-medium"}>{p.name}</div>
        <div className="text-right">
          <div className={`num ${big ? "text-2xl" : "text-lg"}`}>{usd(p.youPay)}</div>
          {discounted && <div className="num text-xs text-faint line-through">{usd(p.price)}</div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {p.sustainable ? <span className="badge badge-good">♻ Sustainable · reusable</span> : <span className="badge">Full price</span>}
        {p.bottle && <span className="badge">Recyclable bottle</span>}
        {discounted && <span className="badge badge-good">Government pays {usd(p.price - p.youPay)}</span>}
      </div>
      {big && p.sustainable && credit === 0 && <p className="text-xs text-subtle">Recycle a bottle to get 0.50 USDC off sustainable products.</p>}
    </div>
  );
}

export type FollowUp = { id: string; reference: string; problem_short: string; address: string };

/** Dino asks whether a reported street problem was fixed. */
export function FollowUpCard({
  followUp,
  onAnswer,
}: {
  followUp: FollowUp;
  onAnswer: (status: "resolved" | "badly_resolved" | null) => void;
}) {
  return (
    <div className="card w-full max-w-md overflow-hidden animate-[pop-in_.22s_ease-out]">
      <div className="border-b border-line px-6 py-4">
        <span className="label">Na Minha Rua LX · {followUp.reference}</span>
      </div>
      <div className="space-y-2 px-6 py-5">
        <p className="title text-2xl">Was it fixed?</p>
        <p className="text-sm text-subtle">
          You reported <b className="font-medium text-ink">{followUp.problem_short}</b> at {followUp.address}. Is it resolved now?
        </p>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">
        <button className="btn" onClick={() => onAnswer(null)}>
          Not yet
        </button>
        <button className="btn" onClick={() => onAnswer("badly_resolved")}>
          Badly fixed
        </button>
        <button className="btn btn-primary flex-1" onClick={() => onAnswer("resolved")}>
          Yes, fixed
        </button>
      </div>
    </div>
  );
}
