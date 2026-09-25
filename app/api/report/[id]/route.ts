import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isReportId, notFound, readJson } from "@/lib/report/http";
import { getReport, updateDraft } from "@/lib/report/reports";
import type { ReportPatch } from "@/lib/report/types";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isReportId(id)) return notFound();
  try {
    return NextResponse.json({ ok: true, report: await getReport(id) });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Edit a draft (category, texts, severity, location). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isReportId(id)) return notFound();
  const body = await readJson<ReportPatch>(req);
  try {
    const { report, outsideLisbon } = await updateDraft(id, {
      category: body.category,
      problem_short: body.problem_short,
      description_pt: body.description_pt,
      severity: body.severity,
      lat: body.lat,
      lng: body.lng,
      address: body.address,
    });
    return NextResponse.json({ ok: true, report, outsideLisbon });
  } catch (err) {
    return errorResponse(err);
  }
}
