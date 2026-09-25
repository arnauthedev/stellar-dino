import { NextResponse, type NextRequest } from "next/server";
import { buyProduct } from "@/lib/stellar";

export async function POST(req: NextRequest) {
  const { productId } = (await req.json().catch(() => ({}))) as { productId?: string };
  if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
  try {
    return NextResponse.json(await buyProduct(productId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
