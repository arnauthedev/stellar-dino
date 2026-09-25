import { NextResponse } from "next/server";
import { getGameCode } from "@/lib/game";
import { realtimeConfig } from "@/lib/game-config";

// Laptop (password-protected): current join code + realtime settings.
export async function GET() {
  try {
    return NextResponse.json({ code: await getGameCode(), ...realtimeConfig() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
