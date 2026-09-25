import { DayCalendar, type CalendarEvent } from "@/components/day-calendar";
import { BirdSprite, CactusSprite, CloudSprite, DinoSprite, Ground } from "@/components/pixel";

const demoEvents: CalendarEvent[] = [
  { id: "f", title: "Flight LIS → CDG", start: "10:00", end: "12:35", detail: "TP432", tone: "flight" },
  { id: "t", title: "Taxi to museum", start: "12:35", end: "13:20", tone: "neutral" },
  { id: "m", title: "Louvre entry", start: "13:45", end: "15:45", detail: "slot 13:45", tone: "museum" },
  { id: "s", title: "Airport shop", start: "09:20", end: "09:40", tone: "shop" },
];

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
        <DinoSprite className="h-16 w-auto" />
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

      <Section title="Sprites">
        <div className="pane-soft pane-rounded flex flex-wrap items-end gap-10 px-8 py-6">
          <figure className="flex flex-col items-center gap-2"><DinoSprite className="h-20 w-auto" /><figcaption className="text-xs text-subtle">stand</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><DinoSprite pose="walkA" className="h-20 w-auto" /><figcaption className="text-xs text-subtle">walk A</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><DinoSprite pose="walkB" className="h-20 w-auto" /><figcaption className="text-xs text-subtle">walk B</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><DinoSprite blink className="h-20 w-auto" /><figcaption className="text-xs text-subtle">blink</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><CactusSprite className="h-16 w-auto" /><figcaption className="text-xs text-subtle">cactus</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><BirdSprite className="h-12 w-auto" /><figcaption className="text-xs text-subtle">bird up</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><BirdSprite wings="down" className="h-12 w-auto" /><figcaption className="text-xs text-subtle">bird down</figcaption></figure>
          <figure className="flex flex-col items-center gap-2"><CloudSprite className="h-6 w-auto" /><figcaption className="text-xs text-subtle">cloud</figcaption></figure>
        </div>
      </Section>

      <Section title="Panes (no border, shade only)">
        <div className="grid h-56 grid-cols-2 overflow-hidden rounded-card border border-line">
          <div className="pane relative">
            <div className="absolute top-5 left-6 flex gap-8">
              <div className="flex flex-col gap-1"><span className="label">Score</span><strong className="num text-2xl font-medium">00412</strong></div>
              <div className="flex flex-col gap-1"><span className="label">Best</span><strong className="num text-2xl font-medium text-faint">01280</strong></div>
            </div>
            <CloudSprite className="absolute top-20 right-16 h-4 w-auto" />
            <BirdSprite className="absolute top-24 right-40 h-6 w-auto" />
            <div className="absolute inset-x-0 bottom-8 px-4">
              <div className="flex items-end justify-between px-8"><DinoSprite pose="walkA" className="h-12 w-auto" /><CactusSprite className="h-10 w-auto" /></div>
              <Ground className="mt-0.5" />
            </div>
          </div>
          <div className="pane-well flex items-center justify-center text-sm text-subtle">.pane-well (camera panel)</div>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="pane-well pane-rounded flex-1 p-5">.pane-well .pane-rounded</div>
          <div className="pane-soft pane-rounded flex-1 p-5">.pane-soft .pane-rounded</div>
          <div className="pane-soft flex-1 p-5">.pane-soft (square)</div>
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
        <div className="grid h-[560px] grid-cols-[minmax(280px,25%)_1fr] gap-3">
          <div className="grid min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
            <div className="panel relative flex min-h-0 flex-col p-4">
              <DayCalendar title="Today" events={demoEvents} hourHeight={34} className="min-h-0 flex-1" />
              <button className="icon-btn absolute top-2.5 right-2.5" aria-label="Expand calendar">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            </div>
            <div className="pane-soft pane-rounded relative">
              <div className="absolute inset-x-0 bottom-5 px-4">
                <div className="px-10"><DinoSprite className="h-20 w-auto" /></div>
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
                Done. Flight lands 12:35, taxi 45 min, so the Louvre is at 13:45.
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
