import { NextResponse, type NextRequest } from "next/server";
import { acceptCard, type AcceptRequest } from "@/lib/agent/cards";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as AcceptRequest | null;
  if (!body || !["proposal", "product"].includes(body.kind)) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }
  try {
    return NextResponse.json(await acceptCard(body));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
