import "server-only";
import type { Place } from "@/lib/report/types";

// OpenStreetMap Nominatim (usage policy: descriptive User-Agent, max 1 request/s, cache).
const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "StellarDino-hackathon-demo/1.0 (contact via repo)";

// Lisbon municipality bounding box (sanity check on top of the address fields).
const LISBON_BBOX = { south: 38.6913, north: 38.7967, west: -9.2298, east: -9.0864 };

/* ---------- 1 req/s in-process queue + memory cache ---------- */

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastAt + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastAt = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

const cache = new Map<string, Place | null>();

async function nominatim(path: string): Promise<unknown> {
  return throttled(async () => {
    const res = await fetch(`${NOMINATIM}${path}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-PT,pt;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Address lookup failed (${res.status})`);
    return res.json();
  });
}

type NominatimAddress = Record<string, string | undefined>;
type NominatimPlace = { lat: string; lon: string; display_name?: string; address?: NominatimAddress };

function toPlace(p: NominatimPlace): Place {
  const a = p.address ?? {};
  const lat = Number(p.lat);
  const lng = Number(p.lon);
  const street = [a.road ?? a.pedestrian ?? a.footway ?? a.square ?? a.path, a.house_number].filter(Boolean).join(" ");
  const locality = a.city ?? a.town ?? a.municipality ?? a.village;
  const address =
    [street || a.neighbourhood || a.quarter, a.postcode, locality].filter(Boolean).join(", ") ||
    p.display_name?.split(",").slice(0, 3).join(",") ||
    `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  // Lisbon parishes (freguesias) show up as suburb or city_district in OSM.
  const freguesia = a.suburb ?? a.city_district ?? a.quarter ?? null;
  const cityIsLisboa = [a.city, a.municipality, a.town].some((v) => v === "Lisboa" || v === "Lisbon");
  const inBox =
    lat >= LISBON_BBOX.south && lat <= LISBON_BBOX.north && lng >= LISBON_BBOX.west && lng <= LISBON_BBOX.east;
  return { lat, lng, address, freguesia, inLisbon: cityIsLisboa && inBox };
}

/** lat/lng -> street address + freguesia (+ whether it is inside Lisbon municipality). */
export async function reverseGeocode(lat: number, lng: number): Promise<Place> {
  const key = `r:${lat.toFixed(4)},${lng.toFixed(4)}`; // ~11 m
  const hit = cache.get(key);
  if (hit) return { ...hit, lat, lng };
  const data = (await nominatim(
    `/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
  )) as NominatimPlace & { error?: string };
  if (data.error || !data.address) {
    return { lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, freguesia: null, inLisbon: false };
  }
  const place = { ...toPlace(data), lat, lng };
  cache.set(key, place);
  return place;
}

/** Free-text address -> place (biased to Lisbon). Null when nothing matches. */
export async function forwardGeocode(query: string): Promise<Place | null> {
  const q = query.trim();
  const key = `f:${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    countrycodes: "pt",
    q, // viewbox (not bounded) prefers matches inside Lisbon
    viewbox: `${LISBON_BBOX.west},${LISBON_BBOX.north},${LISBON_BBOX.east},${LISBON_BBOX.south}`,
  });
  const data = (await nominatim(`/search?${params}`)) as NominatimPlace[];
  const place = data[0] ? toPlace(data[0]) : null;
  cache.set(key, place);
  return place;
}
