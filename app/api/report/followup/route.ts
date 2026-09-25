import { NextResponse } from "next/server";
import { triggerFollowUp } from "@/lib/report/followup";
import { errorResponse } from "@/lib/report/http";

/** Demo: make the latest submitted report due for follow-up and broadcast it on "reports"/"followup". */
export async function POST() {
  try {
    const report = await triggerFollowUp();
    if (!report) return NextResponse.json({ ok: false, error: "No submitted report yet." }, { status: 404 });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return errorResponse(err);
  }
}
