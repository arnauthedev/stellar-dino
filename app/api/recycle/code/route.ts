import { NextResponse } from "next/server";
import { newRecycleCode } from "@/lib/recycle";

export async function POST() {
  try {
    return NextResponse.json({ code: await newRecycleCode() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
