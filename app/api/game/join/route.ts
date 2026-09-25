import { NextResponse, type NextRequest } from "next/server";
import { getGameCode } from "@/lib/game";
import { realtimeConfig } from "@/lib/game-config";

// Phones (public): only a valid, current code gets in.
export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("g") || "").trim().toUpperCase();
  try {
    if (!code || code !== (await getGameCode())) {
      return NextResponse.json({ error: "This game code is no longer valid." }, { status: 404 });
    }
    return NextResponse.json({ code, ...realtimeConfig() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
