import { NextResponse, type NextRequest } from "next/server";
import { claimRecycleCode } from "@/lib/recycle";

// Public (phones scan the QR): guarded by the one-time code.
export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || typeof code !== "string" || code.length > 40) {
    return NextResponse.json({ ok: false, reason: "unknown", message: "Missing code." }, { status: 400 });
  }
  const result = await claimRecycleCode(code);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
