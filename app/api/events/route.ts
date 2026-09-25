import { NextResponse, type NextRequest } from "next/server";
import { pollEvents } from "@/lib/stellar";

export async function GET(req: NextRequest) {
  try {
    const cursor = req.nextUrl.searchParams.get("cursor") || undefined;
    return NextResponse.json(await pollEvents(cursor));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
