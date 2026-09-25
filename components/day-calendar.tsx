"use client";

import { useEffect, useRef } from "react";

export type CalendarTone = "flight" | "museum" | "shop" | "neutral" | "delayed";

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  detail?: string;
  tone?: CalendarTone;
};

const TONES: Record<CalendarTone, string> = {
  flight: "bg-accent-soft text-accent-ink border-accent",
  museum: "bg-good-soft text-good border-good",
  shop: "bg-warn-soft text-warn border-warn",
  delayed: "bg-bad-soft text-bad border-bad",
  neutral: "bg-chip text-ink-soft border-subtle",
};

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Give overlapping events side-by-side columns. */
function layout(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const placed: { event: CalendarEvent; col: number; cols: number }[] = [];
  let group: typeof placed = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((p) => p.col + 1));
    group.forEach((p) => (p.cols = cols));
    group = [];
  };
  for (const event of sorted) {
    const start = toMinutes(event.start);
    if (start >= groupEnd) flush();
    const taken = new Set(group.filter((p) => toMinutes(p.event.end) > start).map((p) => p.col));
    let col = 0;
    while (taken.has(col)) col++;
    const entry = { event, col, cols: 1 };
    group.push(entry);
    placed.push(entry);
    groupEnd = Math.max(groupEnd, toMinutes(event.end));
  }
  flush();
  return placed;
}

export function DayCalendar({
  events,
  startHour = 8,
  endHour = 24,
  hourHeight = 40,
  title,
  className,
}: {
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  title?: string;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstStart = events.length ? Math.min(...events.map((e) => toMinutes(e.start))) : null;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const px = (minutes: number) => ((minutes - startHour * 60) / 60) * hourHeight;
  const height = (endHour - startHour) * hourHeight;

  // Keep the first event in view (30 min above it).
  useEffect(() => {
    if (firstStart !== null && scroller.current) {
      scroller.current.scrollTo({ top: Math.max(0, px(firstStart - 30)), behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstStart, hourHeight]);

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      {title && <div className="label mb-3">{title}</div>}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="relative grid grid-cols-[44px_1fr]" style={{ height: height + 16 }}>
          {/* hour labels + lines */}
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="num absolute left-0 -translate-y-1/2 text-[11px] text-faint" style={{ top: px(h * 60) + 8 }}>
                {String(h % 24).padStart(2, "0")}:00
              </div>
              <div className="absolute right-0 left-[44px] h-px bg-line" style={{ top: px(h * 60) + 8 }} />
            </div>
          ))}
          {/* events */}
          <div className="absolute top-2 right-0 bottom-2 left-[48px]">
            {layout(events).map(({ event, col, cols }) => {
              const top = px(toMinutes(event.start));
              const h = Math.max(22, px(toMinutes(event.end)) - top - 2);
              const short = h < 44;
              return (
                <div
                  key={event.id}
                  className={`absolute overflow-hidden rounded-[10px] border-l-[3px] px-2.5 text-[13px] leading-tight ${TONES[event.tone ?? "neutral"]} ${short ? "flex items-center gap-2 py-0" : "py-1.5"}`}
                  style={{
                    top,
                    height: h,
                    left: `calc(${(col / cols) * 100}% + ${col ? 2 : 0}px)`,
                    width: `calc(${100 / cols}% - ${col ? 2 : 0}px)`,
                  }}
                >
                  <div className="truncate font-medium">{event.title}</div>
                  <div className={`num truncate text-[11px] opacity-80 ${short ? "" : "mt-0.5"}`}>
                    {event.start}–{event.end}
                    {event.detail && !short ? ` · ${event.detail}` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
