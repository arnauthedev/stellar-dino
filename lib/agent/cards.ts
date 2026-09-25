import "server-only";
import type { AiToolCall } from "@/lib/ai";
import {
  bookMuseum,
  buyFlight,
  buyProduct,
  getCredit,
  getMuseumBookings,
  getSpendingLimit,
  listFlights,
  listMuseums,
  listProducts,
  museumSlots,
  parseFlightId,
  rescheduleMuseum,
  toMinutes,
  type Flight,
} from "@/lib/stellar";
import { AIRLINE_NAME, parseDate, prettyDate, todayNum, travelMinutes } from "@/lib/trip";

// Cards: Dino's show_options / propose* tool calls become UI cards. Purchases only
// happen in acceptCard(), when the user taps Accept (no model in the loop).

export type FlightOption = {
  id: string;
  code: string;
  date: number;
  dateLabel: string;
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  depart: string;
  arrive: string;
  price: number;
  held: number;
  status: Flight["status"];
};
export type MuseumItem = { museumId: string; name: string; style: string; date: number; dateLabel: string; time: string; price: number; reschedule: boolean };
export type MuseumOption = { id: string; name: string; style: string; price: number; minutesFromAirport: number };
export type ProductOption = { id: string; name: string; price: number; sustainable: boolean; bottle: boolean; youPay: number };

export type Card =
  | { kind: "proposal"; airline: string; flights: FlightOption[]; museums: MuseumItem[]; total: number; limitLeft: number }
  | { kind: "product"; product: ProductOption; credit: number; limitLeft: number }
  | { kind: "flights"; airline: string; dateLabel: string; options: FlightOption[] }
  | { kind: "museums"; date: number; dateLabel: string; options: MuseumOption[] }
  | { kind: "museum_slots"; museumId: string; name: string; style: string; price: number; date: number; dateLabel: string; reschedule: boolean; options: { time: string }[] }
  | { kind: "products"; credit: number; options: ProductOption[] };

function flightOption(f: Flight): FlightOption {
  return {
    id: f.id,
    code: f.code,
    date: f.date,
    dateLabel: prettyDate(f.date),
    from: f.from,
    to: f.to,
    fromCity: f.fromCity,
    toCity: f.toCity,
    depart: f.depart,
    arrive: f.arrive,
    price: f.price,
    held: Math.round(f.price * 0.2 * 100) / 100,
    status: f.status,
  };
}

async function productOptions() {
  const [products, credit] = await Promise.all([listProducts(), getCredit()]);
  return {
    credit,
    options: products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      sustainable: p.sustainable,
      bottle: p.bottle,
      youPay: p.sustainable ? Math.max(0, p.price - credit) : p.price,
    })),
  };
}

async function museumItem(museumId: string, date: number, time: string): Promise<MuseumItem | null> {
  const [museums, bookings] = await Promise.all([listMuseums(), getMuseumBookings()]);
  const m = museums.find((x) => x.id === museumId);
  if (!m) return null;
  const reschedule = bookings.some((b) => b.museumId === museumId && b.date === date);
  return { museumId, name: m.name, style: m.style, date, dateLabel: prettyDate(date), time, price: reschedule ? 0 : m.price, reschedule };
}

/** Build the card for the last show_options / propose* call of a Dino turn (if any). */
export async function cardFromCalls(calls: AiToolCall[]): Promise<Card | null> {
  const call = [...calls].reverse().find((c) => !c.error && /^(show_options|propose)/.test(c.name));
  if (!call) return null;
  const a = call.args as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);

  if (call.name === "propose") {
    const ids = (a.flight_ids as string[] | undefined) ?? [];
    const flights: FlightOption[] = [];
    for (const id of ids) {
      const { date } = parseFlightId(id);
      const f = (await listFlights({ date })).find((x) => x.id === id);
      if (f) flights.push(flightOption(f));
    }
    const museums: MuseumItem[] = [];
    for (const m of (a.museums as { museum_id: string; date: string; time: string }[] | undefined) ?? []) {
      const item = await museumItem(m.museum_id, parseDate(m.date) ?? todayNum(), m.time);
      if (item) museums.push(item);
    }
    if (!flights.length && !museums.length) return null;
    const limit = await getSpendingLimit();
    const total = flights.reduce((t, f) => t + f.price, 0) + museums.reduce((t, m) => t + m.price, 0);
    return { kind: "proposal", airline: AIRLINE_NAME, flights, museums, total, limitLeft: limit.remaining };
  }
  if (call.name === "propose_product") {
    const [{ credit, options }, limit] = await Promise.all([productOptions(), getSpendingLimit()]);
    const product = options.find((p) => p.id === s("product_id"));
    return product ? { kind: "product", product, credit, limitLeft: limit.remaining } : null;
  }

  // show_options
  const date = parseDate(s("date")) ?? todayNum();
  if (a.kind === "flights") {
    const flights = await listFlights({ date, from: s("from"), to: s("to") });
    return { kind: "flights", airline: AIRLINE_NAME, dateLabel: prettyDate(date), options: flights.filter((f) => f.status === "Scheduled").map(flightOption) };
  }
  if (a.kind === "museums") {
    const words = (s("style") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const museums = (await listMuseums()).filter((m) => words.every((w) => `${m.style} ${m.name}`.toLowerCase().includes(w)));
    return {
      kind: "museums",
      date,
      dateLabel: prettyDate(date),
      options: museums.map((m) => ({ id: m.id, name: m.name, style: m.style, price: m.price, minutesFromAirport: travelMinutes("airport", m.id) })),
    };
  }
  if (a.kind === "museum_slots" && s("museum_id")) {
    const museumId = s("museum_id")!;
    const [museums, slots, bookings] = await Promise.all([listMuseums(), museumSlots(museumId, date), getMuseumBookings()]);
    const m = museums.find((x) => x.id === museumId);
    if (!m) return null;
    const after = s("after") ? toMinutes(s("after")!) : 0;
    return {
      kind: "museum_slots",
      museumId,
      name: m.name,
      style: m.style,
      price: m.price,
      date,
      dateLabel: prettyDate(date),
      reschedule: bookings.some((b) => b.museumId === museumId && b.date === date),
      options: slots.filter((x) => x.free > 0 && x.minutes >= after).map((x) => ({ time: x.time })),
    };
  }
  if (a.kind === "products") return { kind: "products", ...(await productOptions()) };
  return null;
}

export type AcceptRequest =
  | { kind: "proposal"; flightIds: string[]; museums: { museumId: string; date: number; time: string }[] }
  | { kind: "product"; productId: string };

export type AcceptResult = { message: string; links: { label: string; href: string }[] };

/** The user tapped Accept: pay from the smart wallet (agent key, within the limit). */
export async function acceptCard(req: AcceptRequest): Promise<AcceptResult> {
  const links: AcceptResult["links"] = [];
  const parts: string[] = [];

  if (req.kind === "proposal") {
    for (const id of req.flightIds) {
      const { code, date } = parseFlightId(id);
      const r = await buyFlight(id);
      links.push({ label: `Flight ${code}`, href: r.explorerUrl });
      parts.push(`${AIRLINE_NAME} ${code} on ${prettyDate(date)} for ${r.result.price.toFixed(2)} USDC (${r.result.held.toFixed(2)} held until landing)`);
    }
    const bookings = await getMuseumBookings();
    for (const m of req.museums) {
      if (bookings.some((b) => b.museumId === m.museumId && b.date === m.date)) {
        const r = await rescheduleMuseum(m.museumId, m.time, m.date);
        links.push({ label: "Museum reschedule", href: r.explorerUrl });
        parts.push(`${r.result.museumName} moved to ${r.result.time} at no cost`);
      } else {
        const r = await bookMuseum(m.museumId, m.time, m.date);
        links.push({ label: r.result.museumName, href: r.explorerUrl });
        parts.push(`${r.result.museumName} on ${prettyDate(r.result.date)} at ${r.result.time} for ${r.result.price.toFixed(2)} USDC`);
      }
    }
  } else {
    const r = await buyProduct(req.productId);
    links.push({ label: "Shop payment", href: r.explorerUrl });
    const { userPaid, govPaid } = r.result;
    parts.push(
      govPaid > 0
        ? `bought: you paid ${userPaid.toFixed(2)} USDC and the Government paid ${govPaid.toFixed(2)} from your recycling credit`
        : `bought for ${userPaid.toFixed(2)} USDC`,
    );
  }
  const message = req.kind === "product" ? `Done! ${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)}.` : `Done! Booked ${parts.join(", and ")}.`;
  return { message, links };
}
