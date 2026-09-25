"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useToastSink, type Toast } from "@/components/live";
import { CloudSprite, DinoSprite, FoodSprite, Ground, type DinoLook, type DinoPose } from "@/components/pixel";

// Dino, the agent's companion.
// - its eye follows the pointer; it stays in the middle of its box and idles
// - while you type in the chat it walks to the side nearest the chat and watches it
// - falls asleep after 5 s without activity
// - reacts to events (nod, happy double jump on a refund, "…" while thinking)
// - chain-event toasts show up as its speech bubbles
// - click it: a hop, and an options bubble (history, incident, food, profile)

export type Reaction = "happy" | "jump" | "think";
export type CompanionOption = "history" | "incident" | "food" | "profile";

type ReactionDetail = { reaction: Reaction; say?: string };

type CompanionCtx = { react: (reaction: Reaction, say?: string) => void; bus: EventTarget };
const Ctx = createContext<CompanionCtx | null>(null);

export function useCompanion(): Pick<CompanionCtx, "react"> {
  return useContext(Ctx) ?? { react: () => undefined };
}

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [bus] = useState(() => new EventTarget());
  const react = useCallback(
    (reaction: Reaction, say?: string) =>
      bus.dispatchEvent(new CustomEvent<ReactionDetail>("react", { detail: { reaction, say } })),
    [bus],
  );
  return <Ctx.Provider value={{ react, bus }}>{children}</Ctx.Provider>;
}

/* ---------- layout ---------- */

const CHAT_INPUT = 'input[aria-label="Message Dino"]';
const PAD_X = 16; // inset-x-4
const PAD_B = 20; // bottom-5
const MENU_W = 204;
const MENU_H = 56;

/** Dino size in px for a box height: whole multiples of the 21-row bitmap keep pixels crisp. */
function dinoScale(boxH: number | undefined): number {
  if (!boxH) return 4;
  return boxH >= 240 ? 5 : boxH >= 195 ? 4 : 3.5;
}

type Box = { left: number; top: number; width: number; height: number; vw: number; vh: number };

/* ---------- motion ---------- */

type Mode = "idle" | "walk" | "watch" | "sleep" | "jump" | "eat" | "think" | "menu";
type State = {
  mode: Mode;
  x: number; // 0..1 across the box
  dir: 1 | -1;
  y: number; // jump height in dino pixels (bitmap rows)
  pose: DinoPose;
  blink: boolean;
  look: DinoLook;
  jumpT: number;
  jumps: number;
  jumpH: number;
  until: number; // tick when a timed mode (think/eat) ends
  nodUntil: number;
  lookUpUntil: number;
  nextBlink: number;
  nextHop: number;
  tick: number;
};

/** Everything the tick needs from the outside world, read in the interval (never during render). */
type Env = {
  now: number;
  lastActivity: number;
  menuOpen: boolean;
  reduced: boolean;
  /** Pointer direction from the dino's head, in screen space. */
  pointer: DinoLook | null;
  /** Where to stand while the user types, or null when not typing. */
  typing: { x: number; dir: 1 | -1; look: DinoLook } | null;
  rand: number;
};

const TICK_MS = 100;
const JUMP_TICKS = 7;
const SLEEP_AFTER_MS = 5000;
const TYPING_MS = 1500;
const MIN_X = 0.04;
const MAX_X = 0.96;
const WALK_SPEED = 0.03;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const sign = (v: number, dead: number): -1 | 0 | 1 => (v > dead ? 1 : v < -dead ? -1 : 0);

function jumping(s: State, n: State): State {
  n.jumpT = s.jumpT + 1;
  const t = n.jumpT / JUMP_TICKS;
  n.y = Math.max(0, 4 * s.jumpH * t * (1 - t));
  n.pose = "stand";
  if (n.jumpT >= JUMP_TICKS) {
    n.y = 0;
    n.jumpT = 0;
    n.jumps = s.jumps - 1;
    if (n.jumps <= 0) n.mode = "idle";
  }
  return n;
}

function step(s: State, env: Env): State {
  const n: State = { ...s, tick: s.tick + 1 };
  n.blink = n.tick >= s.nextBlink && n.tick < s.nextBlink + 2;
  if (n.tick >= s.nextBlink + 2) n.nextBlink = n.tick + 25 + Math.round(env.rand * 30);

  // Eye: toward the pointer (sprite space is mirrored when facing left), up on news.
  const eye: DinoLook = env.pointer ? { x: (env.pointer.x * s.dir) as DinoLook["x"], y: env.pointer.y } : { x: 0, y: 0 };
  n.look = n.tick < s.lookUpUntil ? { x: 1, y: -1 } : eye;

  if (s.mode === "jump") return jumping(s, n);
  n.y = 0;
  if ((s.mode === "eat" || s.mode === "think") && n.tick < s.until) {
    n.pose = s.mode === "eat" && n.tick % 4 < 2 ? "walkA" : "stand";
    if (s.mode === "think") n.look = { x: 1, y: -1 };
    return n;
  }
  if (env.menuOpen) {
    n.mode = "menu";
    n.pose = "stand";
    n.look = { x: 0, y: -1 }; // looking at the bubble
    return n;
  }
  if (env.now - env.lastActivity > SLEEP_AFTER_MS) {
    n.mode = "sleep";
    n.pose = "stand";
    n.blink = true; // eyes closed
    return n;
  }

  const target = env.typing ? env.typing.x : 0.5;
  const delta = target - s.x;
  if (Math.abs(delta) > 0.015) {
    if (env.reduced) {
      n.x = target;
    } else {
      n.mode = "walk";
      n.dir = delta > 0 ? 1 : -1;
      n.x = s.x + n.dir * Math.min(Math.abs(delta), WALK_SPEED);
      n.pose = s.pose === "walkA" ? "walkB" : "walkA";
      n.look = { x: 1, y: 0 };
      return n;
    }
  }
  n.pose = "stand";
  if (env.typing) {
    n.mode = "watch";
    n.dir = env.typing.dir;
    n.look = n.tick < s.lookUpUntil ? n.look : { x: (env.typing.look.x * n.dir) as DinoLook["x"], y: env.typing.look.y };
    return n;
  }
  n.mode = "idle";
  // Turn toward the pointer when it's clearly on the other side.
  if (env.pointer && env.pointer.x !== 0 && env.pointer.x !== s.dir) {
    n.dir = env.pointer.x;
    n.look = { x: 1, y: env.pointer.y };
  }
  // Occasional small hop.
  if (!env.reduced && n.tick >= s.nextHop) {
    n.nextHop = n.tick + 70 + Math.round(env.rand * 60);
    return { ...n, mode: "jump", jumps: 1, jumpT: 0, jumpH: 2.5 };
  }
  return n;
}

/* ---------- options ---------- */

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const OPTIONS: { id: CompanionOption; label: string; icon: React.ReactNode }[] = [
  { id: "history", label: "History", icon: icon("M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01") },
  { id: "incident", label: "Report incident", icon: icon("M12 4 2.5 20h19L12 4zM12 10v4M12 17h.01") },
  { id: "food", label: "Give food", icon: icon("M12 8c-3-3-8-1-8 4 0 4 3 8 5 8 1 0 2-.6 3-.6s2 .6 3 .6c2 0 5-4 5-8 0-5-5-7-8-4zM12 8c0-2 1-4 3-5") },
  { id: "profile", label: "Profile", icon: icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0") },
];

const TONE_DOT: Record<NonNullable<Toast["tone"]>, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  neutral: "bg-accent",
};

/** Speech bubble tail, pointing down at `x` (px or a CSS length) from the bubble's left edge. */
function Tail({ x, up = false }: { x: number | string; up?: boolean }) {
  const at = typeof x === "number" ? `${x}px` : x;
  return (
    <span
      aria-hidden="true"
      className={`absolute h-2.5 w-4 bg-white ${
        up ? "bottom-full [clip-path:polygon(50%_0,100%_100%,0_100%)]" : "top-full [clip-path:polygon(0_0,100%_0,50%_100%)]"
      }`}
      style={{ left: `clamp(12px, calc(${at} - 8px), calc(100% - 28px))` }}
    />
  );
}

type MenuState = "closed" | "open" | "closing";

export function Companion({
  className,
  onOption,
}: {
  className?: string;
  onOption?: (option: Exclude<CompanionOption, "food">) => void;
}) {
  const ctx = useContext(Ctx);
  const boxRef = useRef<HTMLDivElement>(null);
  const dinoRef = useRef<HTMLButtonElement>(null);
  const menuEl = useRef<HTMLDivElement>(null);
  const activity = useRef({ last: 0, typed: 0 });
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);
  const stateRef = useRef<State | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [menu, setMenu] = useState<MenuState>("closed");
  const [menuLeft, setMenuLeft] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stackH, setStackH] = useState(0);
  const [food, setFood] = useState<{ id: number; x: number; dir: 1 | -1 } | null>(null);
  const [hop, setHop] = useState(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const foodCount = useRef(0);
  const [s, setS] = useState<State>({
    mode: "idle",
    x: 0.5,
    dir: 1,
    y: 0,
    pose: "stand",
    blink: false,
    look: { x: 0, y: 0 },
    jumpT: 0,
    jumps: 0,
    jumpH: 0,
    until: 0,
    nodUntil: 0,
    lookUpUntil: 0,
    nextBlink: 15,
    nextHop: 90,
    tick: 0,
  });

  const k = dinoScale(box?.height);
  const dinoH = 21 * k;
  const dinoW = 20 * k;

  useEffect(() => {
    stateRef.current = s;
  });

  const wake = () => (activity.current.last = performance.now());

  const say = useCallback((text: string, ms = 3000) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  const doReact = useCallback(
    (reaction: Reaction, text?: string) => {
      activity.current.last = performance.now(); // wake up
      if (text) say(text);
      setS((p) =>
        reaction === "think"
          ? { ...p, mode: "think", until: p.tick + 40, y: 0, nodUntil: p.tick + 3 }
          : { ...p, mode: "jump", jumps: reaction === "happy" ? 2 : 1, jumpT: 0, jumpH: reaction === "happy" ? 9 : 7, nodUntil: p.tick + 3 },
      );
    },
    [say],
  );

  // Reactions from the rest of the page (chat, chain events).
  useEffect(() => {
    if (!ctx) return;
    const onReact = (e: Event) => {
      const { reaction, say: text } = (e as CustomEvent<ReactionDetail>).detail;
      doReact(reaction, text);
    };
    ctx.bus.addEventListener("react", onReact);
    return () => ctx.bus.removeEventListener("react", onReact);
  }, [ctx, doReact]);

  // Chain-event toasts become speech bubbles.
  useToastSink((t) => {
    activity.current.last = performance.now();
    setToasts((all) => [...all.filter((x) => x.id !== t.id), t].slice(-4));
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id)), 7000);
    setS((p) => ({ ...p, nodUntil: p.tick + 4, lookUpUntil: p.tick + 14 }));
  });

  // Box geometry (for sizing and for the speech bubbles, which live outside the box).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ left: r.left, top: r.top, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, []);

  // Height of the speech stack, to flip it below the dino when there's no room above.
  const stackRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setStackH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pointer, typing and activity tracking.
  useEffect(() => {
    const onActivity = () => (activity.current.last = performance.now());
    const onPointer = (e: PointerEvent) => {
      onActivity();
      pointer.current = { x: e.clientX, y: e.clientY };
    };
    const onKey = (e: KeyboardEvent) => {
      onActivity();
      if ((e.target as Element | null)?.matches?.(CHAT_INPUT)) {
        activity.current.typed = performance.now();
        if (e.key.length === 1 && Math.random() < 0.35) setS((p) => ({ ...p, nodUntil: p.tick + 2 }));
      }
    };
    onActivity();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onActivity);
      window.removeEventListener("scroll", onActivity, { capture: true });
    };
  }, []);

  // Animation tick.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => {
      const el = boxRef.current;
      const cur = stateRef.current;
      if (!el || !cur) return;
      const now = performance.now();
      const r = el.getBoundingClientRect();
      const scale = dinoScale(r.height);
      const w = 20 * scale;
      const h = 21 * scale;
      const track = r.width - 2 * PAD_X - w;
      const dinoLeft = r.left + PAD_X + cur.x * track;
      const head = { x: dinoLeft + (cur.dir === 1 ? 0.72 : 0.28) * w, y: r.bottom - PAD_B - h * 0.85 };

      let look: DinoLook | null = null;
      if (pointer.current) {
        look = { x: sign(pointer.current.x - head.x, 24), y: sign(pointer.current.y - head.y, 24) };
      }

      let typing: Env["typing"] = null;
      const input = document.querySelector<HTMLInputElement>(CHAT_INPUT);
      if (input && (document.activeElement === input || now - activity.current.typed < TYPING_MS)) {
        const ir = input.getBoundingClientRect();
        const cx = ir.left + ir.width / 2;
        const cy = ir.top + ir.height / 2;
        const ly = sign(cy - head.y, h * 0.6);
        if (ir.left >= r.right - 8) typing = { x: MAX_X, dir: 1, look: { x: 1, y: ly } };
        else if (ir.right <= r.left + 8) typing = { x: MIN_X, dir: -1, look: { x: 1, y: ly } };
        else {
          // Chat is above/below (phones): stand over its side nearest the box centre and look down at it.
          const rel = clamp((cx - r.left - PAD_X - w / 2) / Math.max(1, track), MIN_X, MAX_X);
          const x = rel > 0.5 ? MAX_X : rel < 0.5 ? MIN_X : 0.5;
          typing = { x, dir: x >= 0.5 ? 1 : -1, look: { x: 0, y: ly || 1 } };
        }
      }

      const env: Env = {
        now,
        lastActivity: activity.current.last,
        menuOpen: menuOpenRef.current,
        reduced,
        pointer: look,
        typing,
        rand: Math.random(),
      };
      setS((prev) => {
        const next = step(prev, env);
        return reduced ? { ...next, y: 0 } : next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const closeMenu = useCallback(() => {
    if (!menuOpenRef.current) return;
    menuOpenRef.current = false;
    setMenu("closing");
    setTimeout(() => setMenu((m) => (m === "closing" ? "closed" : m)), 200);
  }, []);

  const openMenu = () => {
    menuOpenRef.current = true;
    if (boxRef.current) {
      const width = boxRef.current.clientWidth;
      const center = PAD_X + s.x * (width - 2 * PAD_X - dinoW) + dinoW / 2;
      setMenuLeft(clamp(center - MENU_W / 2, 8, width - MENU_W - 8));
    }
    setMenu("open");
  };

  const onDino = () => {
    wake();
    setHop((h) => h + 1);
    if (menuOpenRef.current) closeMenu();
    else openMenu();
  };

  // Close the bubble on outside click / Escape.
  useEffect(() => {
    if (menu !== "open") return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuEl.current?.contains(t) || dinoRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeMenu();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  const choose = (option: CompanionOption) => {
    closeMenu();
    if (option === "food") {
      foodCount.current += 1;
      setFood({ id: foodCount.current, x: s.x, dir: s.dir });
      setTimeout(() => {
        setFood(null);
        setS((p) => ({ ...p, mode: "eat", until: p.tick + 12, nodUntil: p.tick + 12 }));
        say("Yum! Thank you!", 2500);
        setTimeout(() => doReact("happy"), 1200);
      }, 700);
      return;
    }
    onOption?.(option);
  };

  const sleeping = s.mode === "sleep";
  const left = `calc(${s.x * 100}% - ${s.x * dinoW}px)`;
  const menuShown = menu !== "closed";
  const menuCenter = box ? PAD_X + s.x * (box.width - 2 * PAD_X - dinoW) + dinoW / 2 : 0;

  // Speech stack (toasts + what Dino says), portalled so long text is never clipped by the panel.
  const speech: { key: string; node: React.ReactNode; toast?: Toast }[] = [
    ...toasts.slice(-2).map((t) => ({ key: t.id, node: t.text, toast: t })),
    ...(!menuShown && bubble ? [{ key: "say", node: bubble }] : []),
    ...(!menuShown && !bubble && s.mode === "think" ? [{ key: "think", node: <span className="animate-pulse">…</span> }] : []),
  ];
  let stack: React.ReactNode = null;
  let tailX = 0;
  let placement: "above" | "below" | "detached" = "above";
  if (box && speech.length) {
    const dinoTop = box.top + box.height - PAD_B - dinoH;
    const dinoBottom = box.top + box.height - PAD_B;
    // Dino scrolled out of view (phones, chatting further down): plain stack at the top of the screen.
    const detached = dinoBottom < 24 || dinoTop > box.vh - 24;
    const width = detached ? Math.min(box.vw - 32, 520) : Math.min(Math.max(box.width - 24, 240), 380, box.vw - 16);
    const dinoCenter = detached ? box.vw / 2 : box.left + menuCenter + s.dir * dinoW * 0.18;
    const stackLeft = clamp(dinoCenter - width / 2, 8, box.vw - width - 8);
    tailX = clamp(dinoCenter - stackLeft, 18, width - 18);
    const above = menuShown ? dinoTop - 12 - MENU_H - 28 : dinoTop - 30;
    // Not enough room above (panel at the top of the page): hang the bubbles below the dino.
    placement = detached ? "detached" : above - stackH < 8 ? "below" : "above";
    if (placement === "below") speech.reverse();
    const style: React.CSSProperties =
      placement === "detached"
        ? { left: stackLeft, top: 16, width }
        : placement === "below"
          ? { left: stackLeft, top: dinoBottom + 24, width }
          : { left: stackLeft, top: above, width, transform: "translateY(-100%)" };
    stack = createPortal(
      <div
        ref={stackRef}
        className="pointer-events-none fixed z-40 flex flex-col items-center gap-2 transition-[left] duration-100 ease-linear"
        style={style}
        aria-live="polite"
      >
        {speech.map((b, i) => {
          const tailed = placement === "below" ? i === 0 : placement === "above" && i === speech.length - 1 && !menuShown;
          const t = b.toast;
          return (
            // Spacers grow in proportion to the tail position, so the bubble always sits over the tail.
            <div key={b.key} className="flex w-full flex-none">
              <span style={{ flexGrow: tailX }} />
              <div className={`pointer-events-auto relative max-w-full flex-none ${placement === "below" ? "origin-top" : "origin-bottom"} animate-[speech-in_.28s_cubic-bezier(.2,.9,.3,1.3)_both] [filter:drop-shadow(0_4px_14px_#23334b24)]`}>
                <div
                  className={`relative flex items-start gap-2.5 rounded-[18px] bg-white text-[13px] leading-snug text-ink-soft ${t ? "py-2.5 pr-2.5 pl-3.5" : "px-3.5 py-2"}`}
                >
                  {t && <span className={`mt-[5px] size-2 flex-none rounded-full ${TONE_DOT[t.tone ?? "neutral"]}`} aria-hidden="true" />}
                  <span className="min-w-0 break-words">
                    {b.node}
                    {t?.href && (
                      <>
                        {" "}
                        <a className="whitespace-nowrap text-accent-ink underline" href={t.href} target="_blank" rel="noreferrer">
                          View tx
                        </a>
                      </>
                    )}
                  </span>
                  {t && (
                    <button
                      className="-mt-0.5 flex size-5 flex-none items-center justify-center rounded-full text-faint hover:bg-field hover:text-ink-soft"
                      onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
                      aria-label="Dismiss"
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  )}
                </div>
                {tailed && <Tail x={`${(tailX / width) * 100}%`} up={placement === "below"} />}
              </div>
              <span style={{ flexGrow: width - tailX }} />
            </div>
          );
        })}
      </div>,
      document.body,
    );
  }

  return (
    <div ref={boxRef} className={`relative overflow-hidden ${className ?? ""}`}>
      <CloudSprite className="absolute top-[12%] left-[12%] h-3 w-auto opacity-80" />
      <CloudSprite className="absolute top-[22%] right-[14%] h-2.5 w-auto opacity-60" />

      {food && (
        <div
          key={food.id}
          className="absolute animate-[dino-drop_.7s_ease-in_forwards]"
          style={
            {
              left: `calc(${food.x * 100}% - ${food.x * dinoW}px + ${PAD_X + (food.dir === 1 ? dinoW * 0.72 : dinoW * 0.08)}px)`,
              "--drop-to": `calc(100% - ${PAD_B + dinoH * 0.72}px)`,
            } as React.CSSProperties
          }
        >
          <FoodSprite className="h-5" />
        </div>
      )}

      {menuShown && (
        <div
          ref={menuEl}
          className={`absolute z-10 origin-bottom [filter:drop-shadow(0_5px_16px_#23334b26)] ${
            menu === "open" ? "animate-[bubble-in_.2s_ease-out_both]" : "pointer-events-none animate-[bubble-out_.2s_ease-in_forwards]"
          }`}
          style={{ left: menuLeft, width: MENU_W, bottom: PAD_B + dinoH + 12 }}
          role="menu"
          aria-label="Dino options"
        >
          <div className="flex justify-between gap-1.5 rounded-[20px] bg-white p-1.5">
            {OPTIONS.map((o, i) => (
              <button
                key={o.id}
                role="menuitem"
                className="icon-btn group relative size-11! animate-[pop-in_.22s_ease-out_both] bg-field!"
                style={{ animationDelay: `${60 + i * 70}ms` }}
                onClick={() => choose(o.id)}
                aria-label={o.label}
              >
                {o.icon}
                <span className="pointer-events-none absolute bottom-full mb-1.5 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {o.label}
                </span>
              </button>
            ))}
          </div>
          <Tail x={clamp(menuCenter - menuLeft, 20, MENU_W - 20)} />
        </div>
      )}

      <div className="absolute inset-x-4 bottom-5">
        <div className="relative" style={{ height: dinoH }}>
          <div className="absolute bottom-0 transition-[left] duration-100 ease-linear" style={{ left, transform: `translateY(${-s.y * k}px)` }}>
            {sleeping && (
              <div className="num pointer-events-none absolute -top-3 right-1 text-subtle" aria-hidden="true">
                <span className="absolute animate-[zz_2.4s_ease-out_infinite] text-sm">z</span>
                <span className="absolute animate-[zz_2.4s_ease-out_.8s_infinite] text-base">z</span>
                <span className="absolute animate-[zz_2.4s_ease-out_1.6s_infinite] text-lg">Z</span>
              </div>
            )}
            <button
              ref={dinoRef}
              className="block cursor-pointer rounded-lg"
              onClick={onDino}
              aria-label="Dino. Click for options"
              aria-haspopup="menu"
              aria-expanded={menu === "open"}
              title="Click me"
            >
              <span className="block" style={{ transform: s.dir === -1 ? "scaleX(-1)" : undefined }}>
                <span key={hop} className={`block origin-bottom ${hop ? "animate-[dino-squash_.45s_ease-out]" : ""}`}>
                  <span className="block" style={{ height: dinoH, width: dinoW }}>
                    <DinoSprite pose={s.pose} blink={s.blink} look={s.look} nod={s.tick < s.nodUntil} className="block h-full w-full" />
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
        <Ground className="mt-0.5" />
      </div>
      {stack}
    </div>
  );
}
