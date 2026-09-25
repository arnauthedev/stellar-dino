import "server-only";
import { randomUUID } from "node:crypto";
import { getServerSupabase } from "@/lib/supabase/server";
import { analyzePhoto } from "@/lib/report/analyze";
import { anchorFingerprint, payCivicReward, reportFingerprint } from "@/lib/report/chain";
import { forwardGeocode, reverseGeocode } from "@/lib/report/geocode";
import {
  REPORT_CATEGORIES,
  SEVERITIES,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type Place,
  type Report,
  type ReportCategory,
  type ReportPatch,
  type Severity,
  type SubmitResponse,
  type SubmittedReport,
} from "@/lib/report/types";

// Street reports: draft (photo + AI analysis) -> MOCK submit to "Na Minha Rua LX"
// -> testnet fingerprint + civic reward -> follow-up -> resolved / badly resolved.

const TABLE = "street_reports";
const BUCKET = "report-photos";
const MAX_IMAGE_BYTES = 1_600_000;
const DUPLICATE_RADIUS_M = 30;
const FOLLOW_UP_DAYS = 14;

const db = () => getServerSupabase();

export class ReportError extends Error {
  constructor(
    message: string,
    public code: "no_location" | "bad_image" | "geocode" | "vision" | "server" | "not_found" | "invalid" = "server",
    public status = 400,
  ) {
    super(message);
  }
}

/* ---------- Helpers ---------- */

async function withPhotoUrl<T extends Report>(r: T): Promise<T> {
  if (!r.photo_path) return { ...r, photo_url: null };
  const { data } = await db().storage.from(BUCKET).createSignedUrl(r.photo_path, 60 * 30);
  return { ...r, photo_url: data?.signedUrl ?? null };
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function decodeImage(dataUrl: string): { bytes: Buffer; mime: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m) throw new ReportError("That photo could not be read. Please try another one.", "bad_image");
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ReportError("The photo is too large (max 1.5 MB).", "bad_image", 413);
  return { bytes, mime: m[1] };
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

async function resolvePlace(req: Pick<AnalyzeRequest, "lat" | "lng" | "address">): Promise<Place> {
  try {
    if (isNum(req.lat) && isNum(req.lng)) {
      if (Math.abs(req.lat) > 90 || Math.abs(req.lng) > 180) throw new ReportError("Invalid coordinates.", "no_location");
      return await reverseGeocode(req.lat, req.lng);
    }
    if (req.address?.trim()) {
      const place = await forwardGeocode(req.address.slice(0, 200));
      if (!place) throw new ReportError("We couldn't find that address. Try another spelling or drop a pin on the map.", "geocode");
      return place;
    }
  } catch (err) {
    if (err instanceof ReportError) throw err;
    throw new ReportError("The address service is not responding. Try again in a moment.", "geocode", 502);
  }
  throw new ReportError("We need a location: allow location access, type an address or drop a pin.", "no_location");
}

/** Nearest submitted/resolved report within 30 m with the same category (drafts are ignored). */
async function findDuplicate(lat: number, lng: number, category: ReportCategory, excludeId?: string): Promise<Report | null> {
  const dLat = 0.0005; // ~55 m prefilter box
  const dLng = 0.0007;
  const { data, error } = await db()
    .from(TABLE)
    .select("*")
    .neq("status", "draft")
    .eq("category", category)
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng)
    .limit(20);
  if (error) throw new ReportError(error.message, "server", 500);
  const hits = (data as Report[])
    .filter((r) => r.id !== excludeId && r.lat != null && r.lng != null)
    .map((r) => ({ r, d: haversineM(lat, lng, r.lat!, r.lng!) }))
    .filter((x) => x.d <= DUPLICATE_RADIUS_M)
    .sort((a, b) => a.d - b.d);
  return hits[0] ? withPhotoUrl(hits[0].r) : null;
}

/* ---------- Analyze (creates the draft) ---------- */

export async function analyzeReport(req: AnalyzeRequest): Promise<Extract<AnalyzeResponse, { ok: true }>> {
  const { bytes, mime } = decodeImage(req.image);
  const place = await resolvePlace(req);
  const comment = req.comment?.trim().slice(0, 500) || null;

  let analysis: Awaited<ReturnType<typeof analyzePhoto>>;
  try {
    analysis = await analyzePhoto({ imageDataUrl: req.image, address: place.address, comment });
  } catch (err) {
    console.error("[report] vision failed:", err instanceof Error ? err.message : err);
    throw new ReportError("The AI couldn't look at the photo right now. Your draft is kept, please try again.", "vision", 502);
  }
  const v = analysis.vision;

  const id = randomUUID();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const photoPath = `${id}.${ext}`;
  const up = await db().storage.from(BUCKET).upload(photoPath, bytes, { contentType: mime, upsert: false });
  if (up.error) throw new ReportError(`Photo upload failed: ${up.error.message}`, "server", 500);

  const row = {
    id,
    photo_path: photoPath,
    lat: place.lat,
    lng: place.lng,
    address: place.address,
    freguesia: place.freguesia,
    location_source: req.locationSource === "exif" || req.locationSource === "device" ? req.locationSource : "manual",
    category: v.category,
    problem_short: v.problem_short,
    description_pt: v.description_pt,
    description_en: v.description_en,
    severity: v.severity,
    safety_risk: v.safety_risk,
    confidence: v.confidence,
    is_reportable: v.is_reportable,
    reason: v.reason || null,
    other_problems: v.other_problems || null,
    comment,
    status: "draft",
    tokens_in: analysis.tokensIn,
    tokens_out: analysis.tokensOut,
  };
  const { data, error } = await db().from(TABLE).insert(row).select("*").single();
  if (error) throw new ReportError(error.message, "server", 500);

  const duplicate = v.is_reportable ? await findDuplicate(place.lat, place.lng, v.category, id) : null;
  return {
    ok: true,
    report: await withPhotoUrl(data as Report),
    outsideLisbon: !place.inLisbon,
    duplicate,
    lowConfidence: !v.is_reportable || v.confidence < 0.5,
  };
}

/* ---------- Reads ---------- */

export async function getReport(id: string): Promise<Report> {
  const { data, error } = await db().from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new ReportError(error.message, "server", 500);
  if (!data) throw new ReportError("Report not found.", "not_found", 404);
  return withPhotoUrl(data as Report);
}

export async function listReports(limit = 50): Promise<Report[]> {
  const { data, error } = await db().from(TABLE).select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new ReportError(error.message, "server", 500);
  return Promise.all((data as Report[]).map(withPhotoUrl));
}

/* ---------- Edit draft ---------- */

export async function updateDraft(id: string, patch: ReportPatch): Promise<{ report: Report; outsideLisbon: boolean }> {
  const update: Record<string, unknown> = {};
  if (patch.category !== undefined) {
    if (!REPORT_CATEGORIES.includes(patch.category as ReportCategory)) throw new ReportError("Unknown category.", "invalid");
    update.category = patch.category;
  }
  if (patch.severity !== undefined) {
    if (!SEVERITIES.includes(patch.severity as Severity)) throw new ReportError("Unknown severity.", "invalid");
    update.severity = patch.severity;
  }
  if (typeof patch.problem_short === "string") update.problem_short = patch.problem_short.trim().slice(0, 120);
  if (typeof patch.description_pt === "string") update.description_pt = patch.description_pt.trim().slice(0, 1200);

  let outsideLisbon = false;
  const moved = isNum(patch.lat) && isNum(patch.lng);
  if (moved || patch.address) {
    const place = await resolvePlace({ lat: patch.lat, lng: patch.lng, address: patch.address });
    Object.assign(update, { lat: place.lat, lng: place.lng, address: place.address, freguesia: place.freguesia, location_source: "manual" });
    outsideLisbon = !place.inLisbon;
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await db().from(TABLE).update(update).eq("id", id).eq("status", "draft").select("*").maybeSingle();
  if (error) throw new ReportError(error.message, "server", 500);
  if (!data) throw new ReportError("Only drafts can be edited.", "invalid", 409);
  if (!moved && !patch.address) {
    const r = data as Report;
    outsideLisbon = r.lat != null && r.lng != null ? !(await reverseGeocode(r.lat, r.lng)).inLisbon : false;
  }
  return { report: await withPhotoUrl(data as Report), outsideLisbon };
}

/* ---------- Submit (MOCK portal) + testnet anchor + reward ---------- */

export async function submitReport(id: string): Promise<Extract<SubmitResponse, { ok: true }>> {
  const draft = await getReport(id);
  if (draft.status !== "draft") {
    if (draft.reference) return { ok: true, report: draft as SubmittedReport, warning: "This report was already submitted." };
    throw new ReportError("This report can't be submitted.", "invalid", 409);
  }
  if (draft.lat == null || draft.lng == null) throw new ReportError("The report has no location.", "no_location");
  if (!draft.category || !draft.description_pt?.trim()) throw new ReportError("Please add a category and a description.", "invalid");
  const place = await reverseGeocode(draft.lat, draft.lng).catch(() => null);
  if (place && !place.inLisbon) throw new ReportError("This spot is outside Lisbon: Na Minha Rua LX only covers Lisbon municipality.", "invalid", 422);

  const seq = await db().rpc("next_street_report_seq");
  if (seq.error) throw new ReportError(seq.error.message, "server", 500);
  const reference = `LX-2026-${String(seq.data).padStart(6, "0")}`;
  const now = new Date();
  const { data, error } = await db()
    .from(TABLE)
    .update({
      status: "submitted",
      reference,
      submitted_at: now.toISOString(),
      follow_up_at: new Date(now.getTime() + FOLLOW_UP_DAYS * 86_400_000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) throw new ReportError(error.message, "server", 500);
  if (!data) return { ok: true, report: (await getReport(id)) as SubmittedReport, warning: "This report was already submitted." };
  let report = data as SubmittedReport;

  // Testnet: independent steps; a failure never un-submits the report.
  const warnings: string[] = [];
  const fingerprint = reportFingerprint(report);
  const chainUpdate: Record<string, unknown> = { fingerprint: fingerprint.toString("hex") };
  const [anchor, reward] = await Promise.allSettled([anchorFingerprint(reference, fingerprint), payCivicReward()]);
  if (anchor.status === "fulfilled") Object.assign(chainUpdate, { anchor_tx: anchor.value.txHash, anchor_url: anchor.value.explorerUrl });
  else warnings.push(`The fingerprint couldn't be anchored on Stellar (${String(anchor.reason?.message ?? anchor.reason).slice(0, 160)}).`);
  if (reward.status === "fulfilled") Object.assign(chainUpdate, { reward_tx: reward.value.txHash, reward_url: reward.value.explorerUrl });
  else warnings.push(`The reward couldn't be paid (${String(reward.reason?.message ?? reward.reason).slice(0, 160)}).`);

  const upd = await db().from(TABLE).update(chainUpdate).eq("id", id).select("*").single();
  if (upd.error) warnings.push(`Saving the Stellar receipts failed: ${upd.error.message}`);
  else report = upd.data as SubmittedReport;

  return { ok: true, report: await withPhotoUrl(report), ...(warnings.length ? { warning: warnings.join(" ") } : {}) };
}

/* ---------- Outcome ---------- */

export async function setReportStatus(id: string, status: "resolved" | "badly_resolved"): Promise<Report> {
  if (status !== "resolved" && status !== "badly_resolved") throw new ReportError("Unknown status.", "invalid");
  const { data, error } = await db()
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "draft")
    .select("*")
    .maybeSingle();
  if (error) throw new ReportError(error.message, "server", 500);
  if (!data) throw new ReportError("Only submitted reports can be marked as resolved.", "invalid", 409);
  return withPhotoUrl(data as Report);
}

/** Latest submitted report (for the follow-up nudge). */
export async function latestSubmitted(): Promise<Report | null> {
  const { data, error } = await db()
    .from(TABLE)
    .select("*")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new ReportError(error.message, "server", 500);
  return (data as Report | null) ?? null;
}

export async function setFollowUpNow(id: string): Promise<Report> {
  const { data, error } = await db()
    .from(TABLE)
    .update({ follow_up_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new ReportError(error.message, "server", 500);
  return withPhotoUrl(data as Report);
}
