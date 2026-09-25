import { NextResponse } from "next/server";
import { getBottles, getCredit } from "@/lib/stellar";

export async function GET() {
  try {
    const [credit, bottles] = await Promise.all([getCredit(), getBottles()]);
    return NextResponse.json({ credit, bottles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
