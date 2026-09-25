import { NextResponse, type NextRequest } from "next/server";
import { getCheckout, payShopCode } from "@/lib/shop-qr";

// Public (phones scan the counter QR): guarded by the one-time code.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const checkout = code ? await getCheckout(code) : null;
  if (!checkout) return NextResponse.json({ error: "Unknown code" }, { status: 404 });
  return NextResponse.json(checkout);
}

export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || code.length > 40) return NextResponse.json({ ok: false, message: "Missing code" }, { status: 400 });
  const result = await payShopCode(code);
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
