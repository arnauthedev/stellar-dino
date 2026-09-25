import { NextResponse } from "next/server";
import { getAgentState } from "@/lib/agent-state";

export async function GET() {
  try {
    return NextResponse.json(await getAgentState());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
