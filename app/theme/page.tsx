import { CactusSprite, CloudSprite, DinoSprite, Ground } from "@/components/pixel";

const swatches: [string, string][] = [
  ["bg", "#fafbfc"],
  ["surface", "#ffffff"],
  ["chip", "#e9edf2"],
  ["muted", "#edf1f6"],
  ["field", "#f1f4f7"],
  ["line", "#e3e8ee"],
  ["ink", "#29313b"],
  ["subtle", "#7b8795"],
  ["faint", "#a2a8b0"],
  ["primary", "#293644"],
  ["accent", "#4585eb"],
  ["dino", "#343b43"],
  ["good", "#507b74"],
  ["warn", "#8d714c"],
  ["bad", "#b0505a"],
];

const players = ["#343b43", "#4876bb", "#9a6583", "#8d714c", "#507b74", "#6e68a0"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

export default function ThemePage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-12 px-4 py-10 sm:px-8">
      <header className="flex items-end gap-5">
        <DinoSprite className="h-14 w-auto" />
        <div>
          <h1 className="title text-3xl">Stellar Dino theme</h1>
          <p className="text-sm text-subtle">Extracted from Motion Dino v2. Light, flat, pill controls, pixel sprites.</p>
        </div>
      </header>

      <Section title="Colours">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {swatches.map(([name, hex]) => (
            <div key={name} className="panel overflow-hidden rounded-ctl!">
              <div className="h-12 border-b border-line" style={{ background: hex }} />
              <div className="px-3 py-2 text-xs">
                <div className="font-medium">{name}</div>
                <div className="num text-faint">{hex}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-4">
          {players.map((c) => (
            <DinoSprite key={c} color={c} className="h-8 w-auto" />
          ))}
          <span className="text-xs text-subtle">player colours (game lanes)</span>
        </div>
      </Section>

      <Section title="Type">
        <div className="space-y-3">
          <p className="title text-3xl">Your flight is 2 h late, so I moved the museum.</p>
          <p className="text-[15px] leading-relaxed">
            Body text is Inter at 14–15px in ink. Labels are small caps with wide tracking.
          </p>
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <span className="label">Balance</span>
              <strong className="num text-[28px] font-medium">120.50</strong>
            </div>
            <div className="flex flex-col gap-1">
              <span className="label">Credit</span>
              <strong className="num text-[28px] font-medium text-faint">0.50</strong>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Controls">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary">Book flight</button>
          <button className="btn">Reschedule</button>
          <button className="btn btn-pill">Enable camera</button>
          <button className="icon-btn" aria-label="Expand">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
          <button className="icon-btn" aria-pressed="true" aria-label="Camera on">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h12v10H3zM15 10l6-3v10l-6-3" />
            </svg>
          </button>
          <div className="segments" role="tablist">
            <button className="segment" role="tab" aria-selected="true">Jump</button>
            <button className="segment" role="tab" aria-selected="false">Squat</button>
          </div>
        </div>
        <div className="flex max-w-md gap-2">
          <input className="field" placeholder="Ask Dino to plan your trip…" />
          <button className="btn btn-primary">Send</button>
        </div>
      </Section>

      <Section title="Badges and toast">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-good">♻ Sustainable</span>
          <span className="badge badge-warn">20% held</span>
          <span className="badge badge-bad">Delayed +2 h</span>
          <span className="badge">Full price</span>
          <span className="pill"><b className="num">3</b> players</span>
        </div>
        <div className="toast inline-flex items-center gap-3">
          Flight delayed 2 h. 20 USDC refunded.
          <a className="text-accent-ink underline" href="#">View tx</a>
        </div>
      </Section>

      <Section title="Agent page layout (static mock)">
        <div className="grid h-[420px] grid-cols-[minmax(280px,25%)_1fr] gap-3">
          <div className="grid grid-rows-[2fr_1fr] gap-3">
            <div className="panel relative p-4">
              <span className="label">Calendar</span>
              <div className="mt-3 space-y-2 text-sm">
                <div className="rounded-ctl bg-accent-soft px-3 py-2 text-accent-ink">10:00 Flight LIS → PAR</div>
                <div className="rounded-ctl bg-good-soft px-3 py-2 text-good">15:30 Museum entry</div>
              </div>
              <button className="icon-btn absolute right-3 bottom-3" aria-label="Expand calendar">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </div>
            <div className="panel relative overflow-hidden">
              <CloudSprite className="absolute top-5 left-8 h-3 w-auto" />
              <CloudSprite className="absolute top-9 right-10 h-3 w-auto" />
              <div className="absolute inset-x-0 bottom-6 px-3">
                <div className="flex items-end justify-between px-6">
                  <DinoSprite className="h-11 w-auto" />
                  <CactusSprite className="h-9 w-auto" />
                </div>
                <Ground className="mt-0.5" />
              </div>
            </div>
          </div>
          <div className="panel flex flex-col p-4">
            <span className="label">Chat with Dino</span>
            <div className="flex-1 space-y-3 py-4 text-[15px]">
              <p className="ml-auto w-fit max-w-[75%] rounded-[18px] bg-primary px-4 py-2.5 text-white">
                Book me a flight to Paris and a museum visit.
              </p>
              <p className="w-fit max-w-[75%] rounded-[18px] bg-muted px-4 py-2.5">
                Done. Flight at 10:00, museum at 15:30 (arrival + 45 min + buffer).
              </p>
            </div>
            <div className="flex gap-2">
              <input className="field" placeholder="Message Dino…" />
              <button className="btn btn-primary">Send</button>
            </div>
          </div>
        </div>
      </Section>
    </main>
  );
}
