import "server-only";
import { broadcast } from "@/lib/realtime";
import { latestSubmitted, setFollowUpNow } from "@/lib/report/reports";
import type { Report } from "@/lib/report/types";

/** Realtime channel/event for the follow-up nudge ("Was it fixed?"). */
export const REPORTS_CHANNEL = "reports";
export const FOLLOWUP_EVENT = "followup";

/** Demo shortcut: make the latest submitted report due for follow-up now and tell the browsers. */
export async function triggerFollowUp(): Promise<Report | null> {
  const latest = await latestSubmitted();
  if (!latest) return null;
  const report = await setFollowUpNow(latest.id);
  await broadcast(REPORTS_CHANNEL, FOLLOWUP_EVENT, {
    id: report.id,
    reference: report.reference,
    problem_short: report.problem_short,
    address: report.address,
  });
  return report;
}
