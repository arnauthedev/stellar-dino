// Fixed fake travel data shared by the calendar and the agent (travel_time tool).

export const TRAVEL_MINUTES: Record<string, number> = {
  "airport-museum": 45,
  "museum-airport": 45,
  "airport-hotel": 30,
};

/** Minutes between arriving and the earliest museum slot we book. */
export const MUSEUM_BUFFER_MINUTES = 30;
/** How long a museum visit is shown in the calendar. */
export const MUSEUM_VISIT_MINUTES = 120;

export const MUSEUM_NAME = "Louvre Museum";

export function travelMinutes(from: string, to: string): number {
  return TRAVEL_MINUTES[`${from}-${to}`.toLowerCase()] ?? 45;
}
