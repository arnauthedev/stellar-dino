import { NextResponse, type NextRequest } from "next/server";
import { askDino } from "@/lib/agent/dino";
import type { AiMessage } from "@/lib/ai";

// Booking a trip is several testnet transactions; give the agent time.
export const maxDuration = 120;

type Body = {
  messages?: { role: string; content: string }[];
  /** Blockchain fact for Dino to act on (e.g. a delay refund), not shown as a user message. */
  event?: string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const history: AiMessage[] = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-20)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 2000) }));
  if (body.event) history.push({ role: "developer", content: `EVENT: ${body.event.slice(0, 500)}` });
  if (history.length === 0) return NextResponse.json({ error: "Empty conversation" }, { status: 400 });

  try {
    const { calls, ...reply } = await askDino(history);
    return NextResponse.json({ ...reply, tools: calls.map((c) => ({ name: c.name, error: c.error })) });
  } catch (err) {
    console.error("chat failed", err);
    return NextResponse.json(
      { reply: "Oops, my tiny arms slipped. Could you try that again?", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
