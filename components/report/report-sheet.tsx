"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/dialog";
import { DinoSprite } from "@/components/pixel";
import { PinMap } from "@/components/report/pin-map";
import { deviceLocation, fileToJpeg, readExifGps, videoFrameToJpeg } from "@/components/report/photo";
import {
  PORTAL_URL,
  REPORT_CATEGORIES,
  REPORT_REWARD_USDC,
  SEVERITIES,
  portalText,
  type AnalyzeResponse,
  type LocationSource,
  type Place,
  type Report,
  type ReportCategory,
  type Severity,
  type SubmitResponse,
  type SubmittedReport,
} from "@/lib/report/types";

// "Report a street problem (Lisbon)": photo -> AI draft -> edit -> MOCK submit to
// "Na Minha Rua LX" (+ Stellar testnet fingerprint and civic reward).

type Loc = { lat: number; lng: number; source: LocationSource; address?: string; freguesia?: string | null; inLisbon?: boolean };
type Analysis = Extract<AnalyzeResponse, { ok: true }>;
type Edits = { category: ReportCategory; problem_short: string; description_pt: string; severity: Severity };
type Step = "capture" | "analyzing" | "preview" | "submitting" | "done";

const SOURCE_LABEL: Record<LocationSource, string> = {
  exif: "From the photo",
  device: "Your current location",
  manual: "Set by you",
};
const SEVERITY_LABEL: Record<Severity, string> = { low: "Low", medium: "Medium", high: "High" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
    });
  } catch {
    throw new Error("You seem to be offline. Your draft is kept: try again in a moment.");
  }
  const data = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!res.ok || !data || data.ok === false) throw new Error(data?.error || `Something went wrong (${res.status}). Your draft is kept.`);
  return data;
}

const noSubscribe = () => () => {};
function useCanWebcam(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia("(pointer: fine)").matches && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
}

export function ReportSheet({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: (r: SubmittedReport) => void;
}) {
  // State lives here (not inside the Dialog body) so a draft survives closing the sheet.
  const [step, setStep] = useState<Step>("capture");
  const [photo, setPhoto] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [loc, setLoc] = useState<Loc | null>(null);
  const [locBusy, setLocBusy] = useState<string | null>(null);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [webcam, setWebcam] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [edits, setEdits] = useState<Edits | null>(null);
  const [ackLow, setAckLow] = useState(false);
  const [ackDup, setAckDup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ report: SubmittedReport; warning?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const canWebcam = useCanWebcam();
  const lookupSeq = useRef(0);

  const reset = () => {
    setStep("capture");
    setPhoto(null);
    setComment("");
    setLoc(null);
    setLocBusy(null);
    setLocNote(null);
    setAddressQuery("");
    setWebcam(false);
    setAnalysis(null);
    setEdits(null);
    setAckLow(false);
    setAckDup(false);
    setError(null);
    setDone(null);
    setCopied(false);
  };

  const close = () => {
    setWebcam(false);
    onClose();
    if (step === "done") reset();
  };

  /* ---------- Location ---------- */

  const lookup = useCallback(async (lat: number, lng: number, source: LocationSource) => {
    const seq = ++lookupSeq.current;
    setLoc({ lat, lng, source });
    try {
      const { place } = await api<{ place: Place }>(`/api/report/geocode?lat=${lat}&lng=${lng}`);
      if (seq === lookupSeq.current) setLoc({ lat, lng, source, address: place.address, freguesia: place.freguesia, inLisbon: place.inLisbon });
    } catch {
      // Address is optional before analysis; the server geocodes again.
    }
  }, []);

  const locateDevice = useCallback(async () => {
    setLocBusy("Finding your location…");
    setLocNote(null);
    try {
      const p = await deviceLocation();
      await lookup(p.lat, p.lng, "device");
    } catch (err) {
      setLocNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLocBusy(null);
    }
  }, [lookup]);

  const findAddress = async () => {
    const q = addressQuery.trim();
    if (!q) return;
    setLocBusy("Looking up the address…");
    setLocNote(null);
    try {
      const { place } = await api<{ place: Place }>(`/api/report/geocode?q=${encodeURIComponent(q)}`);
      ++lookupSeq.current;
      setLoc({ lat: place.lat, lng: place.lng, source: "manual", address: place.address, freguesia: place.freguesia, inLisbon: place.inLisbon });
    } catch (err) {
      setLocNote(err instanceof Error ? err.message : String(err));
    } finally {
      setLocBusy(null);
    }
  };

  /* ---------- Photo ---------- */

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      // GPS must be read from the ORIGINAL file: the canvas re-encode strips EXIF.
      const [gps, jpeg] = await Promise.all([readExifGps(file), fileToJpeg(file)]);
      setPhoto(jpeg);
      if (gps) {
        setLocNote(null);
        await lookup(gps.lat, gps.lng, "exif");
      } else if (!loc) {
        await locateDevice();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onWebcamFrame = (jpeg: string) => {
    setWebcam(false);
    setPhoto(jpeg);
    setError(null);
    if (!loc) void locateDevice();
  };

  /* ---------- Analyze / edit / submit ---------- */

  const analyze = async () => {
    if (!photo || !loc) return;
    setStep("analyzing");
    setError(null);
    try {
      const res = await api<Analysis>("/api/report/analyze", {
        method: "POST",
        body: JSON.stringify({ image: photo, lat: loc.lat, lng: loc.lng, locationSource: loc.source, comment: comment.trim() || undefined }),
      });
      const r = res.report;
      setAnalysis(res);
      setEdits({
        category: (r.category ?? REPORT_CATEGORIES[0]) as ReportCategory,
        problem_short: r.problem_short ?? "",
        description_pt: r.description_pt ?? "",
        severity: (r.severity ?? "medium") as Severity,
      });
      setAckLow(false);
      setAckDup(false);
      setStep("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("capture");
    }
  };

  const [moving, setMoving] = useState(false);
  const movePreviewPin = async (lat: number, lng: number) => {
    if (!analysis) return;
    setMoving(true);
    setError(null);
    try {
      const res = await api<{ report: Report; outsideLisbon: boolean }>(`/api/report/${analysis.report.id}`, {
        method: "PATCH",
        body: JSON.stringify({ lat, lng }),
      });
      setAnalysis({ ...analysis, report: { ...res.report, photo_url: res.report.photo_url ?? analysis.report.photo_url }, outsideLisbon: res.outsideLisbon });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMoving(false);
    }
  };

  const submit = async () => {
    if (!analysis || !edits) return;
    setStep("submitting");
    setError(null);
    try {
      const r = analysis.report;
      const changed =
        edits.category !== r.category ||
        edits.problem_short !== (r.problem_short ?? "") ||
        edits.description_pt !== (r.description_pt ?? "") ||
        edits.severity !== r.severity;
      if (changed) {
        const patched = await api<{ report: Report; outsideLisbon: boolean }>(`/api/report/${r.id}`, {
          method: "PATCH",
          body: JSON.stringify(edits),
        });
        setAnalysis({ ...analysis, report: patched.report });
      }
      const res = await api<Extract<SubmitResponse, { ok: true }>>(`/api/report/${r.id}/submit`, { method: "POST" });
      setDone({ report: res.report, warning: res.warning });
      setStep("done");
      onSubmitted?.(res.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("preview");
    }
  };

  const copyForPortal = async (r: Report) => {
    const text = portalText({ ...r, ...(edits ?? {}) });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
    window.open(PORTAL_URL, "_blank", "noopener,noreferrer");
  };

  /* ---------- Render ---------- */

  const r = analysis?.report;
  const blockedOutside = !!analysis?.outsideLisbon;
  const needsLowAck = !!analysis?.lowConfidence && !ackLow;
  const needsDupAck = !!analysis?.duplicate && !ackDup;
  const canSubmit = !!edits?.description_pt.trim() && !blockedOutside && !needsLowAck && !needsDupAck && !moving;

  return (
    <Dialog open={open} onClose={close} title={step === "done" ? "Report sent" : "Report a street problem"} wide>
      <div className="flex flex-col gap-5 text-sm">
        {step === "capture" && (
          <>
            <p className="-mt-2 text-subtle">
              Snap a broken sidewalk, an overflowing bin or a dead streetlight in Lisbon. Dino drafts the report for{" "}
              <em>Na Minha Rua LX</em>.
            </p>

            {/* Photo */}
            <section className="flex flex-col gap-3">
              <span className="label">Photo</span>
              {webcam ? (
                <Webcam onCapture={onWebcamFrame} onCancel={() => setWebcam(false)} />
              ) : photo ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                  <img src={photo} alt="Your photo" className="h-48 w-full rounded-ctl bg-well object-cover" />
                  <label className="btn btn-pill absolute right-2 bottom-2 min-h-9! cursor-pointer px-3! py-1.5! text-[13px]!">
                    Retake
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => takePhoto(e.target.files?.[0])} />
                  </label>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="btn btn-primary cursor-pointer">
                    <CameraIcon /> Take photo
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => takePhoto(e.target.files?.[0])} />
                  </label>
                  {canWebcam ? (
                    <button className="btn" onClick={() => setWebcam(true)}>
                      Use webcam
                    </button>
                  ) : (
                    <label className="btn cursor-pointer">
                      Choose from gallery
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => takePhoto(e.target.files?.[0])} />
                    </label>
                  )}
                </div>
              )}
              <p className="text-xs text-faint">Photos are resized and stripped of metadata before upload.</p>
            </section>

            <section className="flex flex-col gap-2">
              <label className="label" htmlFor="report-comment">
                Comment <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <textarea
                id="report-comment"
                className="field min-h-16 resize-y"
                rows={2}
                maxLength={500}
                placeholder="e.g. it has been like this for weeks"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </section>

            {/* Location */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="label">Location</span>
                {loc && <span className="badge">{SOURCE_LABEL[loc.source]}</span>}
              </div>
              <p className={loc ? "text-ink" : "text-subtle"}>
                {locBusy ??
                  (loc
                    ? loc.address
                      ? `${loc.address}${loc.freguesia ? ` · ${loc.freguesia}` : ""}`
                      : `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`
                    : "Add a photo, share your location, type an address or tap the map.")}
              </p>
              {loc?.inLisbon === false && <p className="badge badge-bad self-start">This spot is outside Lisbon</p>}
              {locNote && <p className="text-warn">{locNote}</p>}
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-pill min-h-10! py-2!" onClick={locateDevice} disabled={!!locBusy}>
                  <PinIcon /> Use my location
                </button>
                <form
                  className="flex min-w-0 flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void findAddress();
                  }}
                >
                  <input
                    className="field min-w-40 flex-1 py-2!"
                    placeholder="Type an address in Lisbon"
                    value={addressQuery}
                    onChange={(e) => setAddressQuery(e.target.value)}
                    aria-label="Address"
                  />
                  <button className="btn min-h-10! py-2!" disabled={!addressQuery.trim() || !!locBusy}>
                    Find
                  </button>
                </form>
              </div>
              <PinMap lat={loc?.lat ?? null} lng={loc?.lng ?? null} onMove={(lat, lng) => lookup(lat, lng, "manual")} />
            </section>

            {error && <ErrorNote text={error} />}

            <button className="btn btn-primary w-full" disabled={!photo || !loc || !!locBusy} onClick={analyze}>
              {!photo ? "Add a photo first" : !loc ? "Set the location first" : "Analyse photo"}
            </button>
          </>
        )}

        {step === "analyzing" && (
          <Busy text="Dino is looking at your photo…" sub="Finding the category and writing the description in Portuguese." />
        )}
        {step === "submitting" && <Busy text="Sending your report…" sub="Anchoring its fingerprint on Stellar testnet." />}

        {step === "preview" && r && edits && analysis && (
          <>
            {blockedOutside && (
              <Note tone="bad" title="Outside Lisbon">
                Na Minha Rua LX only covers the municipality of Lisbon. Drag the pin if the location is wrong.
              </Note>
            )}
            {analysis.lowConfidence && (
              <Note tone="warn" title={r.is_reportable ? "Dino isn't sure about this one" : "This may not be a street problem"}>
                <p>{r.reason || `Confidence is low (${Math.round((r.confidence ?? 0) * 100)}%). Check the details below.`}</p>
                {!ackLow && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button className="btn btn-pill min-h-9! py-1.5!" onClick={() => setAckLow(true)}>
                      Report anyway
                    </button>
                    <button className="btn btn-pill min-h-9! py-1.5!" onClick={() => setStep("capture")}>
                      Retake photo
                    </button>
                  </div>
                )}
              </Note>
            )}
            {analysis.duplicate && (
              <Note tone="warn" title="Possibly already reported">
                <p>
                  <span className="num">{analysis.duplicate.reference}</span> · {analysis.duplicate.problem_short} (within 30 m,
                  same category
                  {analysis.duplicate.submitted_at ? `, ${new Date(analysis.duplicate.submitted_at).toLocaleDateString()}` : ""}).
                </p>
                {!ackDup && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button className="btn btn-pill min-h-9! py-1.5!" onClick={() => setAckDup(true)}>
                      It&apos;s a different problem, continue
                    </button>
                    <button
                      className="btn btn-pill min-h-9! py-1.5!"
                      onClick={() => {
                        reset();
                        onClose();
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </Note>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL / data URL */}
              <img src={photo ?? r.photo_url ?? ""} alt="Reported problem" className="h-[200px] w-full rounded-ctl bg-well object-cover" />
              <PinMap lat={r.lat} lng={r.lng} onMove={movePreviewPin} disabled={moving} />
            </div>
            <p className="-mt-2 text-subtle">
              {moving ? "Updating the address…" : `${r.address ?? ""}${r.freguesia ? ` · Freguesia de ${r.freguesia}` : ""}`}
            </p>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Category">
                <select
                  className="field"
                  value={edits.category}
                  onChange={(e) => setEdits({ ...edits, category: e.target.value as ReportCategory })}
                >
                  {REPORT_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Severity">
                <div className="segments" role="listbox" aria-label="Severity">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="option"
                      className="segment px-3.5!"
                      aria-selected={edits.severity === s}
                      onClick={() => setEdits({ ...edits, severity: s })}
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <Field label="Problem (pt-PT)">
              <input
                className="field"
                maxLength={120}
                value={edits.problem_short}
                onChange={(e) => setEdits({ ...edits, problem_short: e.target.value })}
              />
            </Field>
            <Field label="Description (pt-PT, public)">
              <textarea
                className="field min-h-24 resize-y"
                rows={4}
                maxLength={1200}
                value={edits.description_pt}
                onChange={(e) => setEdits({ ...edits, description_pt: e.target.value })}
              />
            </Field>
            {r.description_en && (
              <div className="pane-soft rounded-ctl px-3.5 py-3 text-subtle">
                <span className="label mb-1 block text-[11px]!">In English (for you, not sent)</span>
                {r.description_en}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {r.safety_risk && <span className="badge badge-bad">Safety risk</span>}
              {r.confidence != null && (
                <span className={`badge ${r.confidence >= 0.5 ? "badge-good" : "badge-warn"}`}>
                  Confidence {Math.round(r.confidence * 100)}%
                </span>
              )}
              {r.other_problems && <span className="badge">Also seen: {r.other_problems}</span>}
            </div>

            {error && <ErrorNote text={error} />}

            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="btn btn-primary flex-1" disabled={!canSubmit} onClick={submit}>
                Submit report
              </button>
              <button className="btn" onClick={() => copyForPortal(r)} title="Copies the text and opens the official portal">
                {copied ? "Copied, portal opened" : "Copy for the real portal"}
              </button>
              <button className="btn" onClick={() => setStep("capture")}>
                Back
              </button>
            </div>
            <p className="-mt-2 text-xs text-faint">
              Demo: &ldquo;Submit&rdquo; is a mock. Nothing is sent to Lisbon City Council; use &ldquo;Copy for the real portal&rdquo; to file it
              for real.
            </p>
          </>
        )}

        {step === "done" && done && (
          <>
            <div className="flex items-center gap-4">
              <DinoSprite className="h-14 w-auto shrink-0" pose="walkA" />
              <div className="min-w-0">
                <p className="label">Reference</p>
                <p className="num text-2xl font-medium">{done.report.reference}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="badge badge-good">{done.report.status}</span>
                  {done.report.follow_up_at && (
                    <span className="text-xs text-subtle">Dino will check back {new Date(done.report.follow_up_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
            </div>
            <p className="font-medium">{done.report.problem_short}</p>
            <p className="-mt-3 text-subtle">{done.report.address}</p>
            <div className="pane-soft flex flex-col gap-2 rounded-ctl px-4 py-3">
              <ChainLink href={done.report.anchor_url} label="Report fingerprint anchored on Stellar" />
              <ChainLink href={done.report.reward_url} label={`${REPORT_REWARD_USDC.toFixed(2)} USDC civic reward sent to your wallet`} />
            </div>
            {done.warning && <Note tone="warn" title="Heads up">{done.warning}</Note>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button className="btn btn-primary flex-1" onClick={close}>
                Done
              </button>
              <button className="btn" onClick={() => copyForPortal(done.report)}>
                {copied ? "Copied, portal opened" : "Copy for the real portal"}
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Pieces ---------- */

function Webcam({ onCapture, onCancel }: { onCapture: (jpeg: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setErr("Camera access was denied or no camera was found."));
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-ctl bg-well">
        <video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} className="h-56 w-full object-cover" />
        {err && <p className="absolute inset-0 grid place-items-center p-4 text-center text-bad">{err}</p>}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary flex-1" disabled={!ready} onClick={() => video.current && onCapture(videoFrameToJpeg(video.current))}>
          <CameraIcon /> Capture
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Busy({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center" role="status" aria-live="polite">
      <DinoSprite className="h-16 w-auto animate-bounce" pose="walkA" />
      <p className="text-base font-medium">{text}</p>
      <p className="text-subtle">{sub}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="label text-[11px]!">{label}</span>
      {children}
    </label>
  );
}

function Note({ tone, title, children }: { tone: "warn" | "bad"; title: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-ctl px-4 py-3 ${tone === "bad" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`} role="alert">
      <p className="font-medium">{title}</p>
      <div className="mt-0.5 text-ink-soft">{children}</div>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p className="rounded-ctl bg-bad-soft px-4 py-3 text-bad" role="alert">
      {text}
    </p>
  );
}

function ChainLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <p className="text-faint">{label}: pending</p>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 text-accent-ink hover:underline">
      <span>{label}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
