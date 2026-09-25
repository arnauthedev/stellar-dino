// Shared (client + server) types for "Report a street problem (Lisbon)".
// Reports are drafted here and submitted to a MOCK of the Lisbon City Council
// portal "Na Minha Rua LX" (there is no public API; nothing is sent to the real portal).

export const PORTAL_URL = "https://naminharualx.cm-lisboa.pt/";

export const REPORT_CATEGORIES = [
  "Vias rodoviárias e passeios",
  "Mobiliário urbano",
  "Higiene e limpeza urbana",
  "Obras na via pública ou no subsolo",
  "Iluminação pública",
  "Segurança na via pública",
  "Ambiente e ruído",
  "Espaços verdes",
  "Saneamento",
  "Parques infantis e juvenis",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type LocationSource = "exif" | "device" | "manual";
export type ReportStatus = "draft" | "submitted" | "resolved" | "badly_resolved";

/** Civic reward paid by the government on submit (testnet USDC). */
export const REPORT_REWARD_USDC = 0.5;

/** What the vision model returns (validated). */
export type VisionResult = {
  is_reportable: boolean;
  reason: string;
  category: ReportCategory;
  problem_short: string;
  description_pt: string;
  description_en: string;
  severity: Severity;
  safety_risk: boolean;
  confidence: number;
  other_problems: string;
};

export type Report = {
  id: string;
  created_at: string;
  updated_at: string;
  photo_path: string | null;
  /** Short-lived signed URL (filled by the server when returning a report). */
  photo_url?: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  freguesia: string | null;
  location_source: LocationSource | null;
  category: ReportCategory | null;
  problem_short: string | null;
  description_pt: string | null;
  description_en: string | null;
  severity: Severity | null;
  safety_risk: boolean | null;
  confidence: number | null;
  is_reportable: boolean | null;
  reason: string | null;
  other_problems: string | null;
  comment: string | null;
  status: ReportStatus;
  reference: string | null;
  submitted_at: string | null;
  follow_up_at: string | null;
  fingerprint: string | null;
  anchor_tx: string | null;
  anchor_url: string | null;
  reward_tx: string | null;
  reward_url: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
};

export type SubmittedReport = Report & { status: "submitted"; reference: string };

export type Place = {
  lat: number;
  lng: number;
  address: string;
  freguesia: string | null;
  inLisbon: boolean;
};

/* ---------- API shapes ---------- */

export type AnalyzeRequest = {
  image: string; // data:image/jpeg;base64,...
  lat?: number | null;
  lng?: number | null;
  locationSource: LocationSource;
  address?: string | null;
  comment?: string | null;
};

export type AnalyzeResponse =
  | {
      ok: true;
      report: Report;
      /** Outside Lisbon municipality: submit is blocked. */
      outsideLisbon: boolean;
      /** An existing submitted report within 30 m with the same category. */
      duplicate: Report | null;
      /** Vision says not reportable or confidence < 0.5. */
      lowConfidence: boolean;
    }
  | { ok: false; error: string; code?: "no_location" | "bad_image" | "geocode" | "vision" | "server" };

export type SubmitResponse =
  | { ok: true; report: SubmittedReport; warning?: string }
  | { ok: false; error: string };

export type ReportPatch = Partial<
  Pick<Report, "category" | "problem_short" | "description_pt" | "severity" | "lat" | "lng" | "address" | "freguesia">
>;

/** Canonical plain-text body for the real portal ("Copy for the real portal"). */
export function portalText(r: Pick<Report, "category" | "problem_short" | "description_pt" | "address" | "freguesia" | "lat" | "lng">): string {
  return [
    `Categoria: ${r.category ?? ""}`,
    `Assunto: ${r.problem_short ?? ""}`,
    `Local: ${[r.address, r.freguesia].filter(Boolean).join(" — ")}`,
    r.lat != null && r.lng != null ? `Coordenadas: ${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}` : "",
    "",
    r.description_pt ?? "",
  ]
    .filter((l, i) => l !== "" || i === 4)
    .join("\n");
}

/** ASSUMED vision price (USD per 1M tokens) for the demo's cost estimate; adjust to the real rate card. */
export const VISION_PRICE_PER_M = { input: 0.25, output: 2.0 };

export function estimateCostUsd(tokensIn: number, tokensOut: number): number {
  return (tokensIn * VISION_PRICE_PER_M.input + tokensOut * VISION_PRICE_PER_M.output) / 1_000_000;
}
