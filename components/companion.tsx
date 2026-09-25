"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CloudSprite, DinoSprite, FoodSprite, Ground, type DinoPose } from "@/components/pixel";

// Dino, the agent's companion.
// - follows the mouse, looks at the chat while you type
// - falls asleep after 5 s without activity
// - reacts to events (happy double jump on a refund)
// - click it: options pop up one by one (history, incident, food, profile)

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

/* ---------- motion ---------- */

type Mode = "idle" | "walk" | "watch" | "sleep" | "jump" | "eat" | "think" | "menu";
type State = {
  mode: Mode;
  x: number; // 0..1 across the box
  dir: 1 | -1;
  y: number;
  pose: DinoPose;
  blink: boolean;
  jumpT: number;
  jumps: number;
  until: number; // tick when a timed mode (think/eat) ends
  nextBlink: number;
  tick: number;
};

type Inputs = {
  pointerX: number | null; // pointer position relative to the box (0..1, may be outside)
  lastActivity: number;
  lastTyping: number;
};

const TICK_MS = 100;
const JUMP_TICKS = 7;
const JUMP_HEIGHT = 42;
const SLEEP_AFTER_MS = 5000;
const MIN_X = 0.06;
const DINO_W = 76;
const MENU_W = 190;
const MAX_X = 0.88;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function jumping(s: State, n: State): State {
  n.jumpT = s.jumpT + 1;
  const t = n.jumpT / JUMP_TICKS;
  n.y = Math.max(0, 4 * JUMP_HEIGHT * t * (1 - t));
  n.pose = "stand";
  if (n.jumpT >= JUMP_TICKS) {
    n.y = 0;
    n.jumpT = 0;
    n.jumps = s.jumps - 1;
    if (n.jumps <= 0) n.mode = "idle";
  }
  return n;
}

function step(s: State, inp: Inputs, now: number, menuOpen: boolean): State {
  const n: State = { ...s, tick: s.tick + 1 };
  n.blink = n.tick >= s.nextBlink && n.tick < s.nextBlink + 2;
  if (n.tick >= s.nextBlink + 2) n.nextBlink = n.tick + 25 + Math.round(Math.random() * 30);

  if (s.mode === "jump") return jumping(s, n);
  if ((s.mode === "eat" || s.mode === "think") && n.tick < s.until) {
    n.pose = s.mode === "eat" && n.tick % 4 < 2 ? "walkA" : "stand";
    return n;
  }
  if (menuOpen) {
    n.mode = "menu";
    n.pose = "stand";
    return n;
  }
  if (now - inp.lastActivity > SLEEP_AFTER_MS) {
    n.mode = "sleep";
    n.pose = "stand";
    n.blink = true; // eyes closed
    n.y = 0;
    return n;
  }
  if (now - inp.lastTyping < 1500) {
    // Look at the chat (to the right) while the user types; small nod.
    n.mode = "watch";
    n.dir = 1;
    n.pose = "stand";
    n.y = n.tick % 6 < 3 ? 1 : 0;
    return n;
  }
  n.y = 0;
  if (inp.pointerX !== null) {
    const target = clamp(inp.pointerX, MIN_X, MAX_X);
    const delta = target - s.x;
    if (Math.abs(delta) > 0.03) {
      n.mode = "walk";
      n.dir = delta > 0 ? 1 : -1;
      n.x = s.x + n.dir * Math.min(Math.abs(delta), 0.025);
      n.pose = n.tick % 2 === 0 ? (s.pose === "walkA" ? "walkB" : "walkA") : s.pose === "stand" ? "walkA" : s.pose;
      return n;
    }
    // Arrived: stand and face the pointer.
    n.mode = "idle";
    n.pose = "stand";
    if (Math.abs(inp.pointerX - s.x) > 0.01) n.dir = inp.pointerX > s.x ? 1 : -1;
    return n;
  }
  n.mode = "idle";
  n.pose = "stand";
  return n;
}

/* ---------- options bubble ---------- */

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

export function Companion({
  className,
  onOption,
}: {
  className?: string;
  onOption?: (option: Exclude<CompanionOption, "food">) => void;
}) {
  const ctx = useContext(Ctx);
  const box = useRef<HTMLDivElement>(null);
  const inputs = useRef<Inputs>({ pointerX: null, lastActivity: 0, lastTyping: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLeft, setMenuLeft] = useState(0);
  const menuRef = useRef(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [food, setFood] = useState<{ id: number; x: number } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const foodCount = useRef(0);
  const [s, setS] = useState<State>({
    mode: "idle",
    x: 0.3,
    dir: 1,
    y: 0,
    pose: "stand",
    blink: false,
    jumpT: 0,
    jumps: 0,
    until: 0,
    nextBlink: 15,
    tick: 0,
  });

  const say = useCallback((text: string, ms = 3000) => {
    setBubble(text);
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  const doReact = useCallback(
    (reaction: Reaction, text?: string) => {
      inputs.current.lastActivity = performance.now(); // wake up
      if (text) say(text);
      setS((p) =>
        reaction === "think"
          ? { ...p, mode: "think", until: p.tick + 40, y: 0 }
          : { ...p, mode: "jump", jumps: reaction === "happy" ? 2 : 1, jumpT: 0 },
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

  // Pointer, typing and activity tracking.
  useEffect(() => {
    const activity = () => (inputs.current.lastActivity = performance.now());
    const onPointer = (e: PointerEvent) => {
      activity();
      const r = box.current?.getBoundingClientRect();
      if (r && r.width > 0) inputs.current.pointerX = (e.clientX - r.left) / r.width;
    };
    const onKey = () => {
      activity();
      inputs.current.lastTyping = performance.now();
    };
    activity();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", activity, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", activity, { capture: true });
    };
  }, []);

  // Animation tick.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => {
      setS((prev) => {
        const next = step(prev, inputs.current, performance.now(), menuRef.current);
        return reduced ? { ...next, x: prev.x, y: 0 } : next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const toggleMenu = (open = !menuRef.current) => {
    menuRef.current = open;
    if (open && box.current) {
      // Centre the bubble over the dino, kept inside the box.
      const width = box.current.clientWidth;
      const dinoCenter = 16 + s.x * (width - 32 - DINO_W) + DINO_W / 2;
      setMenuLeft(clamp(dinoCenter - MENU_W / 2, 8, width - MENU_W - 8));
    }
    setMenuOpen(open);
  };

  // Close the bubble on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && box.current?.contains(e.target as Node)) return;
      menuRef.current = false;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const choose = (option: CompanionOption) => {
    toggleMenu(false);
    if (option === "food") {
      foodCount.current += 1;
      setFood({ id: foodCount.current, x: s.x });
      setTimeout(() => {
        setFood(null);
        setS((p) => ({ ...p, mode: "eat", until: p.tick + 12 }));
        say("Yum! Thank you!", 2500);
        setTimeout(() => doReact("happy"), 1200);
      }, 700);
      return;
    }
    onOption?.(option);
  };

  const sleeping = s.mode === "sleep";
  const left = `calc(${s.x * 100}% - ${s.x * DINO_W}px)`;

  return (
    <div ref={box} className={`relative overflow-hidden ${className ?? ""}`}>
      <CloudSprite className="absolute top-[12%] left-[12%] h-3 w-auto opacity-80" />
      <CloudSprite className="absolute top-[22%] right-[14%] h-2.5 w-auto opacity-60" />

      {food && (
        <div key={food.id} className="absolute animate-[drop_.7s_ease-in_forwards]" style={{ left: `calc(${left} + 30px)` }}>
          <FoodSprite className="h-5" />
        </div>
      )}

        {menuOpen && (
          <div
            className="absolute bottom-[112px] z-10 flex gap-1.5 rounded-full bg-white p-1.5 shadow-[var(--shadow-float)]"
            style={{ left: menuLeft, width: MENU_W }}
            role="menu"
            aria-label="Dino options"
          >
            {OPTIONS.map((o, i) => (
              <button
                key={o.id}
                role="menuitem"
                className="icon-btn group relative size-10! animate-[pop-in_.22s_ease-out_both] bg-field!"
                style={{ animationDelay: `${i * 70}ms` }}
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
        )}

      <div className="absolute inset-x-4 bottom-5">
        <div className="relative h-[76px]">
          <div className="absolute bottom-0 transition-[left] duration-100 ease-linear" style={{ left, transform: `translateY(${-s.y}px)` }}>
            {!menuOpen && bubble && (
              <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-xs text-ink-soft shadow-[var(--shadow-float)]">
                {bubble}
              </div>
            )}
            {!menuOpen && !bubble && s.mode === "think" && (
              <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 animate-pulse rounded-full bg-white px-2.5 py-1 text-xs text-subtle shadow-[var(--shadow-float)]">
                …
              </div>
            )}
            {sleeping && (
              <div className="num pointer-events-none absolute -top-4 right-0 text-subtle" aria-hidden="true">
                <span className="absolute animate-[zz_2.4s_ease-out_infinite] text-xs">z</span>
                <span className="absolute animate-[zz_2.4s_ease-out_.8s_infinite] text-sm">z</span>
                <span className="absolute animate-[zz_2.4s_ease-out_1.6s_infinite] text-base">Z</span>
              </div>
            )}
            <button
              className="block cursor-pointer rounded-lg"
              onClick={() => toggleMenu()}
              aria-label="Dino. Click for options"
              aria-expanded={menuOpen}
              title="Click me"
            >
              <span className="block" style={{ transform: s.dir === -1 ? "scaleX(-1)" : undefined }}>
                <DinoSprite pose={s.pose} blink={s.blink} className="h-[72px] w-auto" />
              </span>
            </button>
          </div>
        </div>
        <Ground className="mt-0.5" />
      </div>
    </div>
  );
}
