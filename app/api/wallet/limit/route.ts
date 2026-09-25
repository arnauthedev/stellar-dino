import { NextResponse, type NextRequest } from "next/server";
import { setSpendingLimit } from "@/lib/stellar";

// The user changes their own limit (signed with the user's owner key, not the agent's).
export async function POST(req: NextRequest) {
  const { limit } = (await req.json().catch(() => ({}))) as { limit?: number };
  if (typeof limit !== "number" || !(limit > 0) || limit > 100_000) {
    return NextResponse.json({ error: "Limit must be a positive number" }, { status: 400 });
  }
  try {
    return NextResponse.json(await setSpendingLimit(limit));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
