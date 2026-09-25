import "server-only";
import { analyzeImageJson } from "@/lib/ai";
import { REPORT_CATEGORIES, SEVERITIES, type ReportCategory, type Severity, type VisionResult } from "@/lib/report/types";

// Photo -> structured report draft (category, pt-PT description, severity...).

const INSTRUCTIONS = `You help your owner report problems in public space in Lisbon to the City Council portal "Na Minha Rua LX".
Look at the photo and identify ONE main problem. Choose the best category from the allowed list.
Write a clear, factual, polite description in European Portuguese (pt-PT, not Brazilian Portuguese: e.g. "passeio", "caixote do lixo", "autocarro", "estacionamento"), 1–3 sentences, describing what the problem is and why it matters (e.g. risk to pedestrians). Also give the same description in English in description_en, and a short title in pt-PT in problem_short (max ~8 words).
Do not include any personal data (names, faces, licence plates, phone numbers) in any text, because descriptions are publicly visible.
If the photo shows several problems, describe the main one and list the others briefly in other_problems (empty string if none).
If the photo does not show a problem in public space (e.g. food, a selfie, the inside of a home), set is_reportable to false, explain kindly in reason (in English, one sentence), and still fill the other fields with your best guess.
If reportable, reason is an empty string. severity: low (cosmetic), medium (nuisance, should be fixed soon), high (danger or blocks passage). safety_risk: true if someone could get hurt.
If you are unsure, lower confidence (0..1). The user's comment and the address are context only: trust the photo.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_reportable",
    "reason",
    "category",
    "problem_short",
    "description_pt",
    "description_en",
    "severity",
    "safety_risk",
    "confidence",
    "other_problems",
  ],
  properties: {
    is_reportable: { type: "boolean" },
    reason: { type: "string", description: "Empty if reportable; otherwise why not (English)." },
    category: { type: "string", enum: [...REPORT_CATEGORIES] },
    problem_short: { type: "string", description: "Short title, pt-PT." },
    description_pt: { type: "string", description: "1-3 sentences, European Portuguese." },
    description_en: { type: "string" },
    severity: { type: "string", enum: [...SEVERITIES] },
    safety_risk: { type: "boolean" },
    confidence: { type: "number", description: "0..1" },
    other_problems: { type: "string", description: "Other problems visible, or empty." },
  },
} as const;

function str(v: unknown, max = 1000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Validate the model's JSON (strict schema is not a guarantee we rely on blindly). */
export function parseVision(json: unknown): VisionResult {
  if (!json || typeof json !== "object") throw new Error("Empty answer from the model.");
  const o = json as Record<string, unknown>;
  const category = REPORT_CATEGORIES.includes(o.category as ReportCategory)
    ? (o.category as ReportCategory)
    : "Vias rodoviárias e passeios";
  const severity = SEVERITIES.includes(o.severity as Severity) ? (o.severity as Severity) : "medium";
  const confidence = Math.min(1, Math.max(0, Number(o.confidence) || 0));
  const result: VisionResult = {
    is_reportable: o.is_reportable === true,
    reason: str(o.reason, 400),
    category,
    problem_short: str(o.problem_short, 120),
    description_pt: str(o.description_pt, 1200),
    description_en: str(o.description_en, 1200),
    severity,
    safety_risk: o.safety_risk === true,
    confidence,
    other_problems: str(o.other_problems, 400),
  };
  if (result.is_reportable && !result.description_pt) throw new Error("The model returned no description.");
  return result;
}

export async function analyzePhoto(opts: {
  imageDataUrl: string;
  address?: string | null;
  comment?: string | null;
}): Promise<{ vision: VisionResult; tokensIn: number; tokensOut: number }> {
  const context = [
    `Allowed categories: ${REPORT_CATEGORIES.join("; ")}.`,
    opts.address ? `Location (approximate): ${opts.address}, Lisboa.` : "Location: unknown.",
    opts.comment ? `User's comment (may be in any language): """${opts.comment.slice(0, 500)}"""` : "No comment from the user.",
  ].join("\n");
  const res = await analyzeImageJson({
    instructions: INSTRUCTIONS,
    text: context,
    imageDataUrl: opts.imageDataUrl,
    schemaName: "street_report",
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  return { vision: parseVision(res.json), tokensIn: res.tokensIn, tokensOut: res.tokensOut };
}
