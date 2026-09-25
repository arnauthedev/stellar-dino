import { NextResponse, type NextRequest } from "next/server";
import { forwardGeocode, reverseGeocode } from "@/lib/report/geocode";

/** ?lat=&lng= (reverse) or ?q= (forward). Nominatim, 1 req/s, cached. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const q = sp.get("q")?.trim().slice(0, 200);
  try {
    if (sp.has("lat") && sp.has("lng") && Number.isFinite(lat) && Number.isFinite(lng)) {
      return NextResponse.json({ ok: true, place: await reverseGeocode(lat, lng) });
    }
    if (q) {
      const place = await forwardGeocode(q);
      if (!place) return NextResponse.json({ ok: false, error: "We couldn't find that address." }, { status: 404 });
      return NextResponse.json({ ok: true, place });
    }
    return NextResponse.json({ ok: false, error: "Give lat/lng or q." }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "The address service is not responding. Try again in a moment." }, { status: 502 });
  }
}
