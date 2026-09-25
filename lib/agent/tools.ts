import "server-only";
import type { AiTool } from "@/lib/ai";
import {
  bookMuseum,
  buyFlight,
  buyProduct,
  getBalances,
  getBottles,
  getCredit,
  getHistory,
  getMuseumBooking,
  getMyFlights,
  getSpendingLimit,
  hhmm,
  listFlights,
  listProducts,
  museumSlots,
  rescheduleMuseum,
  toMinutes,
} from "@/lib/stellar";
import { getResetLedger } from "@/lib/demo";
import { MUSEUM_BUFFER_MINUTES, MUSEUM_NAME, travelMinutes } from "@/lib/trip";

// Dino's tools. They wrap lib/stellar.ts; money-moving tools return explorerUrl.

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const str = (description: string) => ({ type: "string", description });

export const dinoTools: AiTool[] = [
  {
    name: "search_flights",
    description: "List today's flights from the demo airline (Lisbon departures), with times, price and status.",
    parameters: obj({ to: str("Optional destination airport code, e.g. CDG (Paris) or AMS (Amsterdam).") }),
    run: async ({ to }) => {
      const flights = await listFlights();
      return flights
        .filter((f) => !to || f.to === String(to).toUpperCase())
        .map((f) => ({
          flight_id: f.id,
          from: f.from,
          to: f.to,
          depart: f.depart,
          arrive: f.arrive,
          price_usdc: f.price,
          status: f.status,
          note: "20% of the price is held until landing and refunded if the flight is late.",
        }));
    },
  },
  {
    name: "book_flight",
    description: "Buy a flight ticket from the user's smart wallet. Airline tickets are never discounted.",
    parameters: obj({ flight_id: str("Flight id from search_flights, e.g. TP432") }, ["flight_id"]),
    run: async ({ flight_id }) => {
      const r = await buyFlight(String(flight_id));
      return { paid_usdc: r.result.price, held_until_landing_usdc: r.result.held, explorerUrl: r.explorerUrl };
    },
  },
  {
    name: "travel_time",
    description: "Travel time in minutes between two places. Known places: airport, museum, hotel.",
    parameters: obj({ from: str("e.g. airport"), to: str("e.g. museum") }, ["from", "to"]),
    run: async ({ from, to }) => ({ minutes: travelMinutes(String(from), String(to)) }),
  },
  {
    name: "museum_slots",
    description: `Free timed-entry slots at the ${MUSEUM_NAME} today. Pass 'after' (HH:MM) to only get slots at or after that time.`,
    parameters: obj({ after: str("Earliest acceptable time, HH:MM") }),
    run: async ({ after }) => {
      const min = after ? toMinutes(String(after)) : 0;
      const slots = await museumSlots();
      return slots.filter((s) => s.free > 0 && s.minutes >= min).map((s) => ({ time: s.time, free_places: s.free }));
    },
  },
  {
    name: "book_museum",
    description: `Buy a timed-entry ticket for the ${MUSEUM_NAME} today (18 USDC). Only one booking per user.`,
    parameters: obj({ time: str("Slot time HH:MM from museum_slots") }, ["time"]),
    run: async ({ time }) => {
      const r = await bookMuseum(String(time));
      return { booked_time: r.result.time, paid_usdc: r.result.price, explorerUrl: r.explorerUrl };
    },
  },
  {
    name: "reschedule_museum",
    description: "Move the user's existing museum booking to another free slot today, at no cost.",
    parameters: obj({ time: str("New slot time HH:MM from museum_slots") }, ["time"]),
    run: async ({ time }) => {
      const r = await rescheduleMuseum(String(time));
      return { new_time: r.result.time, cost_usdc: 0, explorerUrl: r.explorerUrl };
    },
  },
  {
    name: "my_trip",
    description:
      "The user's current bookings: flights (with delay status and real arrival time) and museum booking, plus the earliest museum time that respects arrival + travel + buffer.",
    parameters: obj(),
    run: async () => {
      const [flights, museum] = await Promise.all([getMyFlights(), getMuseumBooking()]);
      const latestArrival = flights.length ? Math.max(...flights.map((f) => f.arriveMinutes)) : null;
      const travel = travelMinutes("airport", "museum");
      return {
        flights: flights.map((f) => ({
          flight_id: f.id,
          route: `${f.from}-${f.to}`,
          depart: f.depart,
          arrive: f.arrive,
          status: f.status,
          delay_minutes: f.delayMinutes,
          held_usdc: f.held,
        })),
        museum: museum ? { time: museum.time } : null,
        earliest_museum_time:
          latestArrival === null ? null : hhmm(latestArrival + travel + MUSEUM_BUFFER_MINUTES),
        rule: `museum at the first free slot at or after arrival + ${travel} min travel + ${MUSEUM_BUFFER_MINUTES} min buffer`,
      };
    },
  },
  {
    name: "shop_products",
    description:
      "Airport shop products with price, sustainable flag, and the price after the user's recycling credit (credit only applies to sustainable products).",
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
    name: "buy_product",
    description:
      "Buy a product at the airport shop from the user's wallet. For sustainable products the recycling credit is applied and the government pays that part.",
    parameters: obj({ product_id: str("product_id from shop_products") }, ["product_id"]),
    run: async ({ product_id }) => {
      const r = await buyProduct(String(product_id));
      return { you_paid_usdc: r.result.userPaid, government_paid_usdc: r.result.govPaid, explorerUrl: r.explorerUrl };
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
        .map((r) => ({ note: r.note, at: r.at, explorerUrl: r.explorerUrl }));
    },
  },
  {
    name: "open_game",
    description: "Open the Motion Dino game (the body-controlled Dino runner) for the user.",
    parameters: obj(),
    run: async () => ({ opened: true }),
  },
];
