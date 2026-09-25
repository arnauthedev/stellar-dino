import "server-only";
import type { AiToolCall } from "@/lib/ai";
import {
  bookMuseum,
  buyFlight,
  buyProduct,
  getCredit,
  getMuseumBooking,
  getSpendingLimit,
  listFlights,
  listProducts,
  museumSlots,
  rescheduleMuseum,
  toMinutes,
  type Flight,
} from "@/lib/stellar";
import { AIRLINE_NAME, MUSEUM_NAME, travelMinutes } from "@/lib/trip";

// Cards: Dino's show_* / propose_* tool calls become UI cards. Purchases only
// happen in acceptCard(), when the user taps Accept (no model in the loop).

export type FlightOption = {
  id: string;
  code: string;
  from: string;
  to: string;
  depart: string;
  arrive: string;
  price: number;
  held: number;
  status: Flight["status"];
};
export type ProductOption = { id: string; name: string; price: number; sustainable: boolean; youPay: number };

export type Card =
  | {
      kind: "trip";
      airline: string;
      flight: FlightOption;
      museum: { name: string; time: string; price: number; travelMinutes: number } | null;
      total: number;
      limitLeft: number;
    }
  | { kind: "museum"; name: string; time: string; price: number; reschedule: boolean; limitLeft: number }
  | { kind: "product"; product: ProductOption; credit: number; limitLeft: number }
  | { kind: "flights"; airline: string; options: FlightOption[] }
  | { kind: "museum_slots"; name: string; options: { time: string; free: number }[]; reschedule: boolean }
  | { kind: "products"; credit: number; options: ProductOption[] };

const MUSEUM_PRICE = 18;

function flightOption(f: Flight): FlightOption {
  return {
    id: f.id,
    code: f.code,
    from: f.from,
    to: f.to,
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
      youPay: p.sustainable ? Math.max(0, p.price - credit) : p.price,
    })),
  };
}

/** Build the card for the last show_/propose_ call of a Dino turn (if any). */
export async function cardFromCalls(calls: AiToolCall[]): Promise<Card | null> {
  const call = [...calls].reverse().find((c) => !c.error && /^(show_options|propose_)/.test(c.name));
  if (!call) return null;
  const a = call.args as Record<string, string | undefined>;

  if (call.name === "propose_trip") {
    const [flights, limit] = await Promise.all([listFlights(), getSpendingLimit()]);
    const f = flights.find((x) => x.id === a.flight_id);
    if (!f) return null;
    const museum = a.museum_time
      ? { name: MUSEUM_NAME, time: a.museum_time, price: MUSEUM_PRICE, travelMinutes: travelMinutes("airport", "museum") }
      : null;
    const total = f.price + (museum?.price ?? 0);
    return { kind: "trip", airline: AIRLINE_NAME, flight: flightOption(f), museum, total, limitLeft: limit.remaining };
  }
  if (call.name === "propose_museum") {
    const [booking, limit] = await Promise.all([getMuseumBooking(), getSpendingLimit()]);
    return { kind: "museum", name: MUSEUM_NAME, time: a.time ?? "", price: booking ? 0 : MUSEUM_PRICE, reschedule: !!booking, limitLeft: limit.remaining };
  }
  if (call.name === "propose_product") {
    const [{ credit, options }, limit] = await Promise.all([productOptions(), getSpendingLimit()]);
    const product = options.find((p) => p.id === a.product_id);
    return product ? { kind: "product", product, credit, limitLeft: limit.remaining } : null;
  }
  // show_options
  if (a.kind === "flights") {
    const flights = await listFlights();
    const to = a.to?.toUpperCase();
    return {
      kind: "flights",
      airline: AIRLINE_NAME,
      options: flights.filter((f) => (!to || f.to === to) && f.status === "Scheduled").map(flightOption),
    };
  }
  if (a.kind === "museum_slots") {
    const [slots, booking] = await Promise.all([museumSlots(), getMuseumBooking()]);
    const after = a.after ? toMinutes(a.after) : 0;
    return {
      kind: "museum_slots",
      name: MUSEUM_NAME,
      reschedule: !!booking,
      options: slots.filter((s) => s.free > 0 && s.minutes >= after).map((s) => ({ time: s.time, free: s.free })),
    };
  }
  if (a.kind === "products") return { kind: "products", ...(await productOptions()) };
  return null;
}

export type AcceptRequest =
  | { kind: "trip"; flightId: string; museumTime?: string | null }
  | { kind: "flight"; flightId: string }
  | { kind: "museum"; time: string }
  | { kind: "product"; productId: string };

export type AcceptResult = { message: string; links: { label: string; href: string }[] };

/** The user tapped Accept: pay from the smart wallet (agent key, within the limit). */
export async function acceptCard(req: AcceptRequest): Promise<AcceptResult> {
  const links: AcceptResult["links"] = [];
  const parts: string[] = [];

  if (req.kind === "trip" || req.kind === "flight") {
    const r = await buyFlight(req.flightId);
    links.push({ label: "Flight payment", href: r.explorerUrl });
    parts.push(`${AIRLINE_NAME} ${req.flightId} booked for ${r.result.price.toFixed(2)} USDC (${r.result.held.toFixed(2)} held until landing)`);
  }
  const museumTime = req.kind === "trip" ? req.museumTime : req.kind === "museum" ? req.time : null;
  if (museumTime) {
    const existing = await getMuseumBooking();
    if (existing) {
      const r = await rescheduleMuseum(museumTime);
      links.push({ label: "Museum reschedule", href: r.explorerUrl });
      parts.push(`museum moved to ${r.result.time} at no cost`);
    } else {
      const r = await bookMuseum(museumTime);
      links.push({ label: "Museum payment", href: r.explorerUrl });
      parts.push(`${MUSEUM_NAME} at ${r.result.time} for ${r.result.price.toFixed(2)} USDC`);
    }
  }
  if (req.kind === "product") {
    const r = await buyProduct(req.productId);
    links.push({ label: "Shop payment", href: r.explorerUrl });
    const { userPaid, govPaid } = r.result;
    parts.push(
      govPaid > 0
        ? `bought it: you paid ${userPaid.toFixed(2)} USDC and the Government paid ${govPaid.toFixed(2)} from your recycling credit`
        : `bought it for ${userPaid.toFixed(2)} USDC`,
    );
  }
  const text = parts.join(", and ");
  return { message: `Done! ${text.charAt(0).toUpperCase()}${text.slice(1)}.`, links };
}
