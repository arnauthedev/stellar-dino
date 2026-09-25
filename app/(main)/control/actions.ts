"use server";

import { markDemoReset } from "@/lib/demo";
import { resetGame } from "@/lib/game";
import { triggerFollowUp } from "@/lib/report/followup";
import { reportFlightStatus, resetDemo } from "@/lib/stellar";

export type ActionResult = { ok: boolean; message: string; explorerUrl?: string };

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function delayFlightAction(flightId: string, minutes: number): Promise<ActionResult> {
  return run(async () => {
    const r = await reportFlightStatus(flightId, true, minutes);
    return { ok: true, message: `${flightId} delayed ${minutes / 60} h. Holds refunded to passengers.`, explorerUrl: r.explorerUrl };
  });
}

export async function onTimeAction(flightId: string): Promise<ActionResult> {
  return run(async () => {
    const r = await reportFlightStatus(flightId, false);
    return { ok: true, message: `${flightId} landed on time. Holds released to the airline.`, explorerUrl: r.explorerUrl };
  });
}

export async function resetDemoAction(): Promise<ActionResult> {
  return run(async () => {
    const log = await resetDemo();
    await markDemoReset();
    return { ok: true, message: `Demo reset: ${log.join(", ")}. History starts fresh.` };
  });
}

export async function resetGameAction(): Promise<ActionResult> {
  return run(async () => ({ ok: true, message: `Game reset. New join code ${await resetGame()}.` }));
}

export async function reportFollowUpAction(): Promise<ActionResult> {
  return run(async () => {
    const r = await triggerFollowUp();
    return r
      ? { ok: true, message: `Follow-up sent for ${r.reference}: Dino asks if it was fixed.` }
      : { ok: false, message: "No submitted street report yet." };
  });
}
