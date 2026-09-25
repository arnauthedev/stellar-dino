import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, isReportId, notFound } from "@/lib/report/http";
import { submitReport } from "@/lib/report/reports";

export const maxDuration = 90;

/** MOCK submission to "Na Minha Rua LX" + testnet fingerprint and civic reward. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isReportId(id)) return notFound();
  try {
    return NextResponse.json(await submitReport(id));
  } catch (err) {
    return errorResponse(err);
  }
}
