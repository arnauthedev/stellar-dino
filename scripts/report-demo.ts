// End-to-end demo of "Report a street problem (Lisbon)" against the real services
// (OpenAI vision, Nominatim, Supabase, Stellar TESTNET). Submission to the portal is a MOCK.
// Usage: npx tsx --conditions=react-server --env-file=.env.local scripts/report-demo.ts
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { triggerFollowUp } from "@/lib/report/followup";
import { analyzeReport, setReportStatus, submitReport } from "@/lib/report/reports";
import { estimateCostUsd, portalText, type AnalyzeResponse, type Report } from "@/lib/report/types";

type Ok = Extract<AnalyzeResponse, { ok: true }>;
const usage = { in: 0, out: 0, calls: 0 };
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

/** Like the browser: max 1024 px, JPEG q0.82, metadata stripped. */
async function photo(file: string): Promise<string> {
  const buf = await sharp(readFileSync(`test-photos/${file}`))
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

function show(label: string, r: Ok) {
  const p: Report = r.report;
  usage.in += p.tokens_in ?? 0;
  usage.out += p.tokens_out ?? 0;
  usage.calls++;
  console.log(`\n== ${label} (${secs()})`);
  console.log(`  draft ${p.id}  ${p.address}  [${p.freguesia ?? "?"}]`);
  console.log(`  reportable=${p.is_reportable} confidence=${p.confidence?.toFixed(2)} severity=${p.severity} safety_risk=${p.safety_risk}`);
  console.log(`  category: ${p.category}`);
  console.log(`  title:    ${p.problem_short}`);
  console.log(`  pt-PT:    ${p.description_pt}`);
  console.log(`  en:       ${p.description_en}`);
  if (p.reason) console.log(`  reason:   ${p.reason}`);
  if (p.other_problems) console.log(`  other:    ${p.other_problems}`);
  console.log(`  flags: outsideLisbon=${r.outsideLisbon} lowConfidence=${r.lowConfidence} duplicate=${r.duplicate ? r.duplicate.reference : "none"}`);
  console.log(`  tokens: in=${p.tokens_in} out=${p.tokens_out}  ~$${estimateCostUsd(p.tokens_in ?? 0, p.tokens_out ?? 0).toFixed(5)}`);
}

(async () => {
  // A random spot around Rua Augusta (Baixa) so reruns don't all collide as duplicates.
  const lat = 38.7101 + (Math.random() - 0.5) * 0.004;
  const lng = -9.1366 + (Math.random() - 0.5) * 0.002;

  const first = await analyzeReport({ image: await photo("pothole.jpg"), lat, lng, locationSource: "device", comment: "Está assim há semanas." });
  show("1. Pothole in Baixa", first);
  console.log("\n  --- Copy for the real portal ---\n" + portalText(first.report).replace(/^/gm, "  "));

  const sub = await submitReport(first.report.id);
  console.log(`\n== 2. Submit (MOCK portal) (${secs()})`);
  console.log(`  reference ${sub.report.reference}  status=${sub.report.status}  follow-up ${sub.report.follow_up_at}`);
  console.log(`  fingerprint sha256 ${sub.report.fingerprint}`);
  console.log(`  anchor tx: ${sub.report.anchor_url ?? "-"}`);
  console.log(`  reward tx: ${sub.report.reward_url ?? "-"}`);
  if (sub.warning) console.log(`  WARNING: ${sub.warning}`);

  const again = await analyzeReport({ image: await photo("pothole.jpg"), lat: lat + 0.00005, lng, locationSource: "device" });
  show("3. Same pothole again (duplicate check)", again);

  const food = await analyzeReport({ image: await photo("not-a-problem-food.jpg"), lat, lng, locationSource: "device" });
  show("4. Plate of pasta (not a street problem)", food);

  const porto = await analyzeReport({ image: await photo("overflowing-bin.jpg"), lat: 41.1496, lng: -8.6109, locationSource: "manual" });
  show("5. Overflowing bin in Porto (outside Lisbon)", porto);
  try {
    await submitReport(porto.report.id);
    console.log("  !! submit outside Lisbon was NOT blocked");
  } catch (err) {
    console.log(`  submit blocked: ${err instanceof Error ? err.message : err}`);
  }

  const fu = await triggerFollowUp();
  console.log(`\n== 6. Follow-up broadcast on "reports"/"followup" for ${fu?.reference} (${secs()})`);
  const done = await setReportStatus(sub.report.id, "resolved");
  console.log(`== 7. Status -> ${done.status}`);

  console.log(`\nVision usage: ${usage.calls} calls, ${usage.in} input + ${usage.out} output tokens, ~$${estimateCostUsd(usage.in, usage.out).toFixed(4)} (assumed rates). Total ${secs()}.`);
})().catch((err) => {
  console.error("DEMO FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
