import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isReportId, notFound, readJson } from "@/lib/report/http";
import { setReportStatus } from "@/lib/report/reports";

/** Follow-up outcome: { status: "resolved" | "badly_resolved" }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isReportId(id)) return notFound();
  const { status } = await readJson<{ status: "resolved" | "badly_resolved" }>(req);
  if (status !== "resolved" && status !== "badly_resolved") {
    return NextResponse.json({ ok: false, error: "status must be resolved or badly_resolved." }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, report: await setReportStatus(id, status) });
  } catch (err) {
    return errorResponse(err);
  }
}
