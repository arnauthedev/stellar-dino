import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, readJson } from "@/lib/report/http";
import { analyzeReport } from "@/lib/report/reports";
import type { AnalyzeRequest } from "@/lib/report/types";

export const maxDuration = 60;

/** Photo (+ location, comment) -> AI-drafted report, stored as a draft. */
export async function POST(req: NextRequest) {
  const body = await readJson<AnalyzeRequest>(req);
  if (typeof body.image !== "string") {
    return NextResponse.json({ ok: false, error: "Missing photo.", code: "bad_image" }, { status: 400 });
  }
  try {
    const result = await analyzeReport({
      image: body.image,
      lat: typeof body.lat === "number" ? body.lat : null,
      lng: typeof body.lng === "number" ? body.lng : null,
      locationSource: body.locationSource ?? "manual",
      address: typeof body.address === "string" ? body.address : null,
      comment: typeof body.comment === "string" ? body.comment : null,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
