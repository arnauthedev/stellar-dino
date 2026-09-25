import "server-only";
import type { AiTool } from "@/lib/ai";
import { getResetLedger } from "@/lib/demo";
import {
  getBalances,
  getBottles,
  getCredit,
  getHistory,
  getMuseumBookings,
  getMyFlights,
  getSpendingLimit,
  hhmm,
  listFlights,
  listMuseums,
  listProducts,
  museumSlots,
  rescheduleMuseum,
  toMinutes,
} from "@/lib/stellar";
import {
  AIRLINE_NAME,
  BOOKING_DAYS_AHEAD,
  HOME_CITY,
  isoDate,
  MUSEUM_BUFFER_MINUTES,
  parseDate,
  todayNum,
  travelMinutes,
  whereAt,
  type Leg,
} from "@/lib/trip";

// Dino's tools. They wrap lib/stellar.ts. Dino never pays on its own: it shows
// options (show_options) or proposes purchases (propose, propose_product) and the
// app renders a card; the purchase runs only when the user taps Accept
// (lib/agent/cards.ts). Exception: moving a museum booking after a flight delay
// (free) is done by Dino.

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const str = (description: string) => ({ type: "string", description });
const dateArg = str("Date as YYYY-MM-DD, or 'today' / 'tomorrow'. Default today.");

function checkDate(input: unknown): number {
  const d = parseDate(input);
  if (d === null) throw new Error("Invalid date, use YYYY-MM-DD");
  if (d < todayNum() || d > todayNum(BOOKING_DAYS_AHEAD)) {
    throw new Error(`Only dates from ${isoDate(todayNum())} to ${isoDate(todayNum(BOOKING_DAYS_AHEAD))} can be booked`);
  }
  return d;
}

async function legs(): Promise<Leg[]> {
  return (await getMyFlights()).map((f) => ({
    date: f.date,
    departMinutes: f.departMinutes,
    arriveMinutes: f.arriveMinutes,
    fromCity: f.fromCity,
    toCity: f.toCity,
    code: f.code,
  }));
}

export const dinoTools: AiTool[] = [
  {
    name: "search_flights",
    description: `${AIRLINE_NAME} flights for a date. Routes: Barcelona (BCN), Paris (CDG), London (LHR), Amsterdam (AMS) to and from Lisbon (LIS).`,
    parameters: obj({ from: str("Origin IATA code, optional"), to: str("Destination IATA code, optional"), date: dateArg }),
    run: async ({ from, to, date }) => {
      const d = checkDate(date);
      const flights = await listFlights({ date: d, from: from as string | undefined, to: to as string | undefined });
      return flights.map((f) => ({
        flight_id: f.id,
        date: isoDate(f.date),
        from: `${f.fromCity} (${f.from})`,
        to: `${f.toCity} (${f.to})`,
        depart: f.depart,
        arrive: f.arrive,
        price_usdc: f.price,
        status: f.status,
      }));
    },
  },
  {
    name: "list_museums",
    description: "Museums in Lisbon with their style (e.g. classic art, contemporary) and entry price.",
    parameters: obj({ style: str("Optional words to match the style, e.g. 'classic art'") }),
    run: async ({ style }) => {
      const museums = await listMuseums();
      const words = String(style ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return museums
        .filter((m) => words.every((w) => `${m.style} ${m.name}`.toLowerCase().includes(w)))
        .map((m) => ({ museum_id: m.id, name: m.name, style: m.style, city: m.city, price_usdc: m.price, minutes_from_airport: travelMinutes("airport", m.id) }));
    },
  },
  {
    name: "museum_slots",
    description: "Free timed-entry slots of a museum on a date. Pass 'after' (HH:MM) to only get slots at or after that time.",
    parameters: obj({ museum_id: str("From list_museums"), date: dateArg, after: str("Earliest acceptable time HH:MM") }, ["museum_id"]),
    run: async ({ museum_id, date, after }) => {
      const d = checkDate(date);
      const min = after ? toMinutes(String(after)) : 0;
      const slots = await museumSlots(String(museum_id), d);
      return slots.filter((s) => s.free > 0 && s.minutes >= min).map((s) => s.time);
    },
  },
  {
    name: "my_calendar",
    description:
      "The user's bookings (flights with real arrival incl. delays, museum visits) sorted by date, plus where they are: they start in " +
      HOME_CITY +
      " and are in a flight's destination after it lands.",
    parameters: obj(),
    run: async () => {
      const [flights, museums] = await Promise.all([getMyFlights(), getMuseumBookings()]);
      const now = whereAt(await legs(), todayNum(), 0);
      return {
        home_city: HOME_CITY,
        today: isoDate(todayNum()),
        city_at_start_of_today: now.city,
        flights: flights.map((f) => ({
          flight_id: f.id,
          date: isoDate(f.date),
          route: `${f.fromCity} -> ${f.toCity}`,
          depart: f.depart,
          arrive: f.arrive,
          status: f.status,
          delay_minutes: f.delayMinutes,
        })),
        museums: museums.map((m) => ({ museum_id: m.museumId, name: m.museumName, date: isoDate(m.date), time: m.time })),
      };
    },
  },
  {
    name: "where_am_i",
    description:
      "Where the user will be at a date/time according to their flights, and (if in Lisbon) the earliest sensible museum time for a museum: landing + travel from the airport + buffer.",
    parameters: obj({ date: dateArg, time: str("HH:MM, default 12:00"), museum_id: str("Optional museum to compute the earliest visit time") }),
    run: async ({ date, time, museum_id }) => {
      const d = checkDate(date);
      const minutes = time ? toMinutes(String(time)) : 12 * 60;
      const w = whereAt(await legs(), d, minutes);
      let earliest: string | null = null;
      if (museum_id && w.since && w.since.date === d && w.city === "Lisbon") {
        earliest = hhmm(w.since.minutes + travelMinutes("airport", String(museum_id)) + MUSEUM_BUFFER_MINUTES);
      }
      return {
        city: w.inFlight ? `in flight ${w.inFlight.code}` : w.city,
        arrived: w.since ? { date: isoDate(w.since.date), time: hhmm(w.since.minutes), flight: w.since.via } : null,
        earliest_museum_time: earliest,
      };
    },
  },
  {
    name: "travel_time",
    description: "Travel minutes between 'airport' (Lisbon) and museum ids, or between museums.",
    parameters: obj({ from: str("'airport' or a museum_id"), to: str("'airport' or a museum_id") }, ["from", "to"]),
    run: async ({ from, to }) => ({ minutes: travelMinutes(String(from), String(to)) }),
  },
  {
    name: "delay_impact",
    description:
      "After a flight delay: which museum bookings on that flight's date no longer fit (visit before new arrival + travel + buffer). Only those need to be moved.",
    parameters: obj({ flight_id: str("Delayed flight id, e.g. SK101_20260926") }, ["flight_id"]),
    run: async ({ flight_id }) => {
      const flights = await getMyFlights();
      const f = flights.find((x) => x.id === String(flight_id)) ?? flights.find((x) => x.status === "Delayed");
      if (!f) return { error: "Flight not found in the user's bookings" };
      const museums = (await getMuseumBookings()).filter((m) => m.date === f.date);
      return {
        flight: { flight_id: f.id, new_arrival: f.arrive, to: f.toCity },
        museums: museums.map((m) => {
          const earliest = f.to === "LIS" ? f.arriveMinutes + travelMinutes("airport", m.museumId) + MUSEUM_BUFFER_MINUTES : 0;
          const needsMove = f.to === "LIS" && m.minutes < earliest;
          return { museum_id: m.museumId, name: m.museumName, date: isoDate(m.date), time: m.time, needs_move: needsMove, earliest_time: needsMove ? hhmm(earliest) : null };
        }),
      };
    },
  },
  {
    name: "reschedule_museum",
    description: "Move an existing museum booking to another free slot on the same date, at no cost.",
    parameters: obj({ museum_id: str("Museum of the booking"), date: dateArg, time: str("New slot HH:MM") }, ["museum_id", "time"]),
    run: async ({ museum_id, date, time }) => {
      const r = await rescheduleMuseum(String(museum_id), String(time), checkDate(date));
      return { new_time: r.result.time, cost_usdc: 0, explorerUrl: r.explorerUrl };
    },
  },
  {
    name: "shop_products",
    description: "Airport shop products with price, sustainable flag, and the price after the user's recycling credit (credit only applies to sustainable products).",
    parameters: obj(),
    run: async () => {
      const [products, credit] = await Promise.all([listProducts(), getCredit()]);
      return {
        recycling_credit_usdc: credit,
        products: products.map((p) => ({
          product_id: p.id,
          name: p.name,
          price_usdc: p.price,
          sustainable: p.sustainable,
          credit_applies: p.sustainable && credit > 0,
          you_pay_usdc: p.sustainable ? Math.max(0, p.price - credit) : p.price,
          recyclable_bottle: p.bottle,
        })),
      };
    },
  },
  {
    name: "check_credit",
    description: "The user's recycling credit, bottles still to recycle, wallet balance and daily spending limit.",
    parameters: obj(),
    run: async () => {
      const [credit, bottles, balances, limit] = await Promise.all([getCredit(), getBottles(), getBalances(), getSpendingLimit()]);
      return {
        recycling_credit_usdc: credit,
        bottles_to_recycle: bottles.unrecycled,
        wallet_balance_usdc: balances.wallet.usdc,
        spending_limit_usdc: limit.limit,
        spent_today_usdc: limit.spent,
        left_today_usdc: limit.remaining,
      };
    },
  },
  {
    name: "get_history",
    description: "The user's recent transactions (newest first) with readable notes.",
    parameters: obj({ limit: { type: "number", description: "How many (default 6)" } }),
    run: async ({ limit }) => {
      const { rows } = await getHistory({ scope: "user", sinceLedger: await getResetLedger() });
      return rows
        .filter((r) => r.kind !== "subsidy_paid")
        .reverse()
        .slice(0, Number(limit) || 6)
        .map((r) => ({ note: r.note, at: r.at }));
    },
  },
  {
    name: "show_options",
    description:
      "Show the user a pickable list as cards: 'flights' (optional from/to/date), 'museums' (optional style), 'museum_slots' (museum_id, date, optional after) or 'products'. Use it when the user wants to see or choose options.",
    parameters: obj(
      {
        kind: { type: "string", enum: ["flights", "museums", "museum_slots", "products"] },
        from: str("Flights: origin IATA"),
        to: str("Flights: destination IATA"),
        date: dateArg,
        style: str("Museums: style words"),
        museum_id: str("Museum slots: museum"),
        after: str("Museum slots: earliest HH:MM"),
      },
      ["kind"],
    ),
    run: async (args) => {
      if (args.date) checkDate(args.date);
      return { shown: true };
    },
  },
  {
    name: "propose",
    description:
      "Propose bookings for the user to accept on ONE card: any number of flights and/or museum visits (only what the user asked for). Nothing is paid until the user accepts.",
    parameters: obj({
      flight_ids: { type: "array", items: { type: "string" }, description: "flight_id values from search_flights" },
      museums: {
        type: "array",
        items: obj({ museum_id: str("museum id"), date: dateArg, time: str("slot HH:MM") }, ["museum_id", "date", "time"]),
      },
    }),
    run: async ({ flight_ids, museums }) => {
      const ms = (museums as { museum_id: string; date: string; time: string }[] | undefined) ?? [];
      for (const m of ms) checkDate(m.date);
      if (!(flight_ids as string[] | undefined)?.length && !ms.length) throw new Error("Nothing to propose");
      return { proposed: true };
    },
  },
  {
    name: "propose_product",
    description: "Propose an airport shop product for the user to accept and pay.",
    parameters: obj({ product_id: str("product_id from shop_products") }, ["product_id"]),
    run: async ({ product_id }) => ({ proposed: true, product_id }),
  },
  {
    name: "open_report",
    description:
      "Open the street-problem report form (Lisbon 'Na Minha Rua LX'): the user takes a photo of a problem in public space (broken sidewalk, overflowing bin, dead streetlight...). Use it when the user wants to report or complain about a street problem.",
    parameters: obj(),
    run: async () => ({ opened: true }),
  },
  {
    name: "open_game",
    description:
      "Open the Motion Dino game (body-controlled Dino runner played with jumps or squats in front of the camera). Use it when the user asks for a game, exercise, a sport or something active to do indoors.",
    parameters: obj(),
    run: async () => ({ opened: true }),
  },
];
