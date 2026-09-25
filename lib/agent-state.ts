import "server-only";
import type { CalendarEvent } from "@/components/day-calendar";
import {
  getBalances,
  getCredit,
  getMuseumBooking,
  getMyFlights,
  getSpendingLimit,
  hhmm,
  listProducts,
  type Product,
  type SpendingLimit,
} from "@/lib/stellar";
import { AIRLINE_NAME, MUSEUM_NAME, MUSEUM_VISIT_MINUTES, travelMinutes } from "@/lib/trip";

export type AgentState = {
  calendar: CalendarEvent[];
  wallet: number;
  credit: number;
  limit: SpendingLimit;
  products: Product[];
};

/** Everything the agent page shows, read from the chain. */
export async function getAgentState(): Promise<AgentState> {
  const [flights, booking, products, credit, balances, limit] = await Promise.all([
    getMyFlights(),
    getMuseumBooking(),
    listProducts(),
    getCredit(),
    getBalances(),
    getSpendingLimit(),
  ]);

  const calendar: CalendarEvent[] = [];
  for (const f of flights) {
    const delayed = f.status === "Delayed";
    calendar.push({
      id: `flight-${f.id}`,
      title: `${AIRLINE_NAME} ${f.code} ${f.from} → ${f.to}`,
      start: f.depart,
      end: f.arrive,
      detail: delayed
        ? `delayed ${f.delayMinutes / 60} h · ${f.held.toFixed(2)} USDC refunded`
        : f.status === "OnTime"
          ? "landed on time"
          : `${f.held.toFixed(2)} USDC held until landing`,
      tone: delayed ? "delayed" : "flight",
    });
    if (booking) {
      const travel = travelMinutes("airport", "museum");
      calendar.push({
        id: `travel-${f.id}`,
        title: "Taxi to the museum",
        start: f.arrive,
        end: hhmm(f.arriveMinutes + travel),
        tone: "neutral",
      });
    }
  }
  if (booking) {
    calendar.push({
      id: "museum",
      title: MUSEUM_NAME,
      start: booking.time,
      end: hhmm(booking.minutes + MUSEUM_VISIT_MINUTES),
      detail: `entry ${booking.time}`,
      tone: "museum",
    });
  }

  return { calendar, wallet: balances.wallet.usdc, credit, limit, products };
}
