"use client";

import { useEffect, useRef, useState } from "react";

export type CalendarTone = "flight" | "museum" | "shop" | "neutral" | "delayed";

export type CalendarEvent = {
  id: string;
  /** yyyymmdd; events without a date are shown on every day view. */
  date?: number;
  title: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  detail?: string;
  tone?: CalendarTone;
};

const TONES: Record<CalendarTone, string> = {
  flight: "bg-accent-soft text-accent-ink",
  museum: "bg-good-soft text-good",
  shop: "bg-warn-soft text-warn",
  delayed: "bg-bad-soft text-bad",
  neutral: "bg-chip text-ink-soft",
};

/** Minutes after midnight in Lisbon, updated every 30 s (client only). */
function useNowMinutes(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const [h, m] = new Date()
        .toLocaleTimeString("en-GB", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false })
        .split(":")
        .map(Number);
      setNow((h % 24) * 60 + m);
    };
    const first = setTimeout(read, 0);
    const id = setInterval(read, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** Red "now" line with a dot, like a phone calendar. */
function NowLine({ top, left }: { top: number; left: string }) {
  return (
    <div className="pointer-events-none absolute right-0 z-10 flex items-center" style={{ top: top - 4, left }} aria-label="Current time">
      <span className="size-2 flex-none rounded-full bg-bad" />
      <span className="h-[1.5px] flex-1 bg-bad" />
    </div>
  );
}

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
  startHour = 6,
  endHour = 24,
  hourHeight = 40,
  title,
  header,
  showNow,
  className,
}: {
  events: CalendarEvent[];
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  title?: string;
  /** Replaces the title row (e.g. day navigation). */
  header?: React.ReactNode;
  /** Draw the current-time line (only for today). */
  showNow?: boolean;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNowMinutes();
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
      {header ?? (title && <div className="label mb-3">{title}</div>)}
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
          {showNow && now !== null && now >= startHour * 60 && now <= endHour * 60 && (
            <NowLine top={px(now) + 8} left="40px" />
          )}
          {/* events */}
          <div className="absolute top-2 right-0 bottom-2 left-[48px]">
            {layout(events).map(({ event, col, cols }) => {
              const top = px(toMinutes(event.start));
              const h = Math.max(22, px(toMinutes(event.end)) - top - 2);
              const short = h < 44;
              return (
                <div
                  key={event.id}
                  className={`absolute overflow-hidden rounded-[10px] px-2.5 text-[13px] leading-tight ${TONES[event.tone ?? "neutral"]} ${short ? "flex items-center gap-2 py-0" : "py-1.5"}`}
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

/** Seven days from today (the booking window); each event is drawn on its date. */
export function WeekCalendar({
  events,
  today,
  startHour = 6,
  endHour = 24,
  hourHeight = 40,
  className,
}: {
  events: CalendarEvent[];
  /** yyyymmdd of today (Lisbon), from the server. */
  today: number;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = useNowMinutes();
  const px = (minutes: number) => ((minutes - startHour * 60) / 60) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  const height = (endHour - startHour) * hourHeight;
  const firstStart = events.length ? Math.min(...events.map((e) => toMinutes(e.start))) : null;

  // Rolling week: today + 6 days = the whole booking window (dates in UTC from yyyymmdd).
  const t = String(today);
  const now = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(4, 6)) - 1, Number(t.slice(6, 8))));
  const todayIndex = 0;
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + (i - todayIndex) * 86_400_000));
  const num = (d: Date) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

  useEffect(() => {
    if (firstStart !== null && scroller.current) {
      scroller.current.scrollTo({ top: Math.max(0, px(firstStart - 30)), behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstStart]);

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div className="grid grid-cols-[44px_repeat(7,1fr)] pr-12 pb-2">
        <div />
        {days.map((d, i) => (
          <div key={i} className="text-center">
            <div className={`label text-[11px]! ${i === todayIndex ? "text-accent-ink!" : ""}`}>
              {d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
            </div>
            <div
              className={`num mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm ${
                i === todayIndex ? "bg-accent text-white" : "text-subtle"
              }`}
            >
              {d.getUTCDate()}
            </div>
          </div>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="relative grid grid-cols-[44px_repeat(7,1fr)]" style={{ height: height + 16 }}>
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="num absolute left-0 -translate-y-1/2 text-[11px] text-faint" style={{ top: px(h * 60) + 8 }}>
                {String(h % 24).padStart(2, "0")}:00
              </div>
              <div className="absolute right-0 left-[44px] h-px bg-line" style={{ top: px(h * 60) + 8 }} />
            </div>
          ))}
          {days.map((day, i) => (
            <div
              key={i}
              className={`absolute top-2 bottom-2 border-l border-line ${i === todayIndex ? "bg-accent-soft/40" : ""}`}
              style={{ left: `calc(44px + ${i} * (100% - 44px) / 7)`, width: "calc((100% - 44px) / 7)" }}
            >
              {i === todayIndex && nowMin !== null && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                <NowLine top={px(nowMin)} left="-4px" />
              )}
              {layout(events.filter((e) => (e.date ?? today) === num(day))).map(({ event, col, cols }) => {
                  const top = px(toMinutes(event.start));
                  const h = Math.max(22, px(toMinutes(event.end)) - top - 2);
                  return (
                    <div
                      key={event.id}
                      className={`absolute overflow-hidden rounded-[8px] px-2 py-1 text-[12px] leading-tight ${TONES[event.tone ?? "neutral"]}`}
                      style={{ top, height: h, left: `calc(${(col / cols) * 100}% + 3px)`, width: `calc(${100 / cols}% - 6px)` }}
                      title={`${event.title} ${event.start}–${event.end}`}
                    >
                      <div className="truncate font-medium">{event.title}</div>
                      {h >= 40 && <div className="num truncate text-[11px] opacity-80">{event.start}–{event.end}</div>}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
