import { NextResponse } from "next/server";
import { getResetLedger } from "@/lib/demo";
import { getHistory } from "@/lib/stellar";

// The user's transactions since the last demo reset, newest first.
export async function GET() {
  try {
    const { rows } = await getHistory({ scope: "user", sinceLedger: await getResetLedger() });
    return NextResponse.json({
      rows: rows.filter((r) => r.kind !== "subsidy_paid" && r.kind !== "pool_funded").reverse(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
