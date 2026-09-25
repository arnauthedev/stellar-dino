import { NextResponse, type NextRequest } from "next/server";
import { topUpWallet } from "@/lib/stellar";

// Demo: add test USDC to the user's wallet.
export async function POST(req: NextRequest) {
  const { amount } = (await req.json().catch(() => ({}))) as { amount?: number };
  const value = typeof amount === "number" && amount > 0 && amount <= 1000 ? amount : 100;
  try {
    return NextResponse.json(await topUpWallet(value));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
