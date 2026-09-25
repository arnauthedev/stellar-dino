import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/report/http";
import { listReports } from "@/lib/report/reports";

/** Street reports, newest first. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, reports: await listReports() });
  } catch (err) {
    return errorResponse(err);
  }
}
