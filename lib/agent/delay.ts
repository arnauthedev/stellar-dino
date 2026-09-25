import "server-only";
import { broadcast } from "@/lib/realtime";
import { getMuseumBookings, getMyFlights, museumSlots, type Flight } from "@/lib/stellar";
import { MUSEUM_BUFFER_MINUTES, prettyDate, travelMinutes } from "@/lib/trip";

// Flight delay -> everything Dino needs to fix the plan, computed in code.

export const AGENT_CHANNEL = "agent";

export type DelayImpact = {
  flightId: string;
  code: string;
  route: string;
  dateLabel: string;
  delayMinutes: number;
  newArrival: string;
  refund: number;
  moves: { museumId: string; name: string; date: number; from: string; to: string | null }[];
  stillFine: { name: string; time: string }[];
};

export async function delayImpact(flight: Flight): Promise<DelayImpact> {
  const mine = (await getMyFlights()).find((f) => f.id === flight.id);
  const museums = (await getMuseumBookings()).filter((m) => m.date === flight.date);
  const moves: DelayImpact["moves"] = [];
  const stillFine: DelayImpact["stillFine"] = [];
  for (const m of museums) {
    const earliest = flight.to === "LIS" ? flight.arriveMinutes + travelMinutes("airport", m.museumId) + MUSEUM_BUFFER_MINUTES : 0;
    if (m.minutes >= earliest) {
      stillFine.push({ name: m.museumName, time: m.time });
      continue;
    }
    const free = (await museumSlots(m.museumId, m.date)).find((s) => s.free > 0 && s.minutes >= earliest);
    moves.push({ museumId: m.museumId, name: m.museumName, date: m.date, from: m.time, to: free?.time ?? null });
  }
  return {
    flightId: flight.id,
    code: flight.code,
    route: `${flight.fromCity} → ${flight.toCity}`,
    dateLabel: prettyDate(flight.date),
    delayMinutes: flight.delayMinutes,
    newArrival: flight.arrive,
    refund: mine?.held ?? 0,
    moves,
    stillFine,
  };
}

/** Text for Dino: facts + exactly what to do. */
export function delayInstruction(d: DelayImpact): string {
  const lines = [
    `Flight ${d.code} (${d.route}) on ${d.dateLabel} is delayed ${d.delayMinutes / 60} h; new arrival ${d.newArrival}. ${d.refund.toFixed(2)} USDC hold refunded to the user.`,
  ];
  for (const m of d.moves) {
    lines.push(
      m.to
        ? `Museum ${m.name} (museum_id ${m.museumId}, date ${String(m.date).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")}) at ${m.from} no longer fits: call reschedule_museum to ${m.to}.`
        : `Museum ${m.name} at ${m.from} no longer fits and there is no free slot later that day: tell the user and offer another day.`,
    );
  }
  for (const m of d.stillFine) lines.push(`Museum ${m.name} at ${m.time} still fits: do not move it.`);
  if (!d.moves.length && !d.stillFine.length) lines.push("No museum bookings are affected.");
  lines.push('Then post one short message to the user, e.g. "Your flight is 2 h late, so I moved the Gulbenkian to 12:00."');
  return lines.join("\n");
}

export async function announceDelay(flight: Flight): Promise<DelayImpact> {
  const impact = await delayImpact(flight);
  await broadcast(AGENT_CHANNEL, "flight_delayed", { ...impact, instruction: delayInstruction(impact) });
  return impact;
}

