// Fixed demo travel data shared by the calendar, the cards and the agent.

export const AIRLINE_NAME = "Skyscannerd";

/** Where the user is before any flight. */
export const HOME_CITY = "Barcelona";

/** Minutes between arriving somewhere and the earliest museum slot we book. */
export const MUSEUM_BUFFER_MINUTES = 30;
/** How long a museum visit is shown in the calendar. */
export const MUSEUM_VISIT_MINUTES = 120;
/** Booking window offered by the app: today + this many days. */
export const BOOKING_DAYS_AHEAD = 6;

/** Fake travel times (minutes) from Lisbon airport to each museum. */
export const AIRPORT_TO_MUSEUM: Record<string, number> = {
  gulbenkian: 20,
  mnaa: 30,
  azulejo: 20,
  maat: 30,
};
const BETWEEN_MUSEUMS = 25;
const DEFAULT_TRAVEL = 30;

/** Travel time between places: "airport" or a museum id. */
export function travelMinutes(from: string, to: string): number {
  const a = from.toLowerCase();
  const b = to.toLowerCase();
  if (a === b) return 0;
  if (a === "airport") return AIRPORT_TO_MUSEUM[b] ?? DEFAULT_TRAVEL;
  if (b === "airport") return AIRPORT_TO_MUSEUM[a] ?? DEFAULT_TRAVEL;
  if (AIRPORT_TO_MUSEUM[a] !== undefined && AIRPORT_TO_MUSEUM[b] !== undefined) return BETWEEN_MUSEUMS;
  return DEFAULT_TRAVEL;
}

/* ---------- dates (yyyymmdd numbers, Lisbon time) ---------- */

export function dateNum(d: Date): number {
  const s = d.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });
  return Number(s.replaceAll("-", ""));
}

export function todayNum(offsetDays = 0): number {
  return dateNum(new Date(Date.now() + offsetDays * 86_400_000));
}

/** 20260926 -> "2026-09-26" */
export function isoDate(n: number): string {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** "2026-09-26" | "today" | "tomorrow" | 20260926 -> 20260926 (null if invalid). */
export function parseDate(input: unknown): number | null {
  if (input === undefined || input === null || input === "") return todayNum();
  if (typeof input === "number") return input;
  const v = String(input).trim().toLowerCase();
  if (v === "today") return todayNum();
  if (v === "tomorrow") return todayNum(1);
  const m = v.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : null;
}

/** "Sat 26 Sep" */
export function prettyDate(n: number): string {
  const d = new Date(`${isoDate(n)}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/* ---------- where is the user ---------- */

export type Leg = { date: number; departMinutes: number; arriveMinutes: number; fromCity: string; toCity: string; code: string };

/**
 * City the user is in at a given date/time, from their booked flights.
 * Before the first flight they are at home; after landing they are in the destination.
 */
export function whereAt(legs: Leg[], date: number, minutes: number) {
  const sorted = [...legs].sort((a, b) => a.date - b.date || a.departMinutes - b.departMinutes);
  let city = HOME_CITY;
  let since: { date: number; minutes: number; via: string } | null = null;
  let inFlight: Leg | null = null;
  for (const leg of sorted) {
    const departed = leg.date < date || (leg.date === date && leg.departMinutes <= minutes);
    const landed = leg.date < date || (leg.date === date && leg.arriveMinutes <= minutes);
    if (landed) {
      city = leg.toCity;
      since = { date: leg.date, minutes: leg.arriveMinutes, via: leg.code };
      inFlight = null;
    } else if (departed) {
      inFlight = leg;
    }
  }
  return { city, since, inFlight };
}
