import "server-only";
import type { CalendarEvent } from "@/components/day-calendar";
import {
  getBalances,
  getCredit,
  getMuseumBookings,
  getMyFlights,
  getSpendingLimit,
  hhmm,
  listProducts,
  type Product,
  type SpendingLimit,
} from "@/lib/stellar";
import { AIRLINE_NAME, MUSEUM_VISIT_MINUTES, todayNum, travelMinutes } from "@/lib/trip";

export type AgentState = {
  today: number;
  calendar: CalendarEvent[];
  wallet: number;
  credit: number;
  limit: SpendingLimit;
  products: Product[];
};

/** Everything the agent page shows, read from the chain. */
export async function getAgentState(): Promise<AgentState> {
  const [flights, museums, products, credit, balances, limit] = await Promise.all([
    getMyFlights(),
    getMuseumBookings(),
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
      date: f.date,
      title: `${AIRLINE_NAME} ${f.code} ${f.from} → ${f.to}`,
      start: f.depart,
      end: f.arriveMinutes > f.departMinutes ? f.arrive : "23:59",
      detail: delayed
        ? `delayed ${f.delayMinutes / 60} h · ${f.held.toFixed(2)} USDC refunded`
        : f.status === "OnTime"
          ? "landed on time"
          : `${f.held.toFixed(2)} USDC held until landing`,
      tone: delayed ? "delayed" : "flight",
    });
  }
  for (const m of museums) {
    // Taxi from the airport when the user lands in Lisbon that day before the visit.
    const landing = flights
      .filter((f) => f.date === m.date && f.to === "LIS" && f.arriveMinutes <= m.minutes)
      .sort((a, b) => b.arriveMinutes - a.arriveMinutes)[0];
    if (landing) {
      calendar.push({
        id: `travel-${m.museumId}-${m.date}`,
        date: m.date,
        title: `Taxi to ${m.museumName}`,
        start: landing.arrive,
        end: hhmm(landing.arriveMinutes + travelMinutes("airport", m.museumId)),
        tone: "neutral",
      });
    }
    calendar.push({
      id: `museum-${m.museumId}-${m.date}`,
      date: m.date,
      title: m.museumName,
      start: m.time,
      end: hhmm(m.minutes + MUSEUM_VISIT_MINUTES),
      detail: `entry ${m.time}`,
      tone: "museum",
    });
  }

  return { today: todayNum(), calendar, wallet: balances.wallet.usdc, credit, limit, products };
}
