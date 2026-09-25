"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CardView, type CardAction } from "@/components/cards";
import { Chat, type ChatMessage } from "@/components/chat";
import { Companion, CompanionProvider, useCompanion, type CompanionOption } from "@/components/companion";
import { HistoryDialog, IncidentDialog, ProfileDialog } from "@/components/companion-dialogs";
import { DayCalendar, WeekCalendar } from "@/components/day-calendar";
import { useChainEvents } from "@/components/live";
import type { AgentState } from "@/lib/agent-state";
import type { Card } from "@/lib/agent/cards";
import type { HistoryRow } from "@/lib/stellar";

const expandIcon = "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7";
const collapseIcon = "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7";

export function AgentView({ initial, wallet }: { initial: AgentState; wallet: string }) {
  return (
    <CompanionProvider>
      <AgentLayout initial={initial} wallet={wallet} />
    </CompanionProvider>
  );
}

function describe(card: Card): string {
  switch (card.kind) {
    case "trip":
      return `${card.airline} ${card.flight.code} ${card.flight.from}-${card.flight.to} at ${card.flight.depart}${card.museum ? ` + museum at ${card.museum.time}` : ""}`;
    case "museum":
      return `museum at ${card.time}`;
    case "product":
      return card.product.name;
    default:
      return card.kind;
  }
}

function AgentLayout({ initial, wallet }: { initial: AgentState; wallet: string }) {
  const [state, setState] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [dialog, setDialog] = useState<Exclude<CompanionOption, "food"> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [paying, setPaying] = useState(false);
  const { react } = useCompanion();
  const router = useRouter();
  const messagesRef = useRef<ChatMessage[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const handledEvents = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const res = await fetch("/api/agent/state", { cache: "no-store" });
    if (res.ok) setState(await res.json());
  }, []);

  const toggleExpanded = () => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition) doc.startViewTransition(() => flushSync(() => setExpanded((e) => !e)));
    else setExpanded((e) => !e);
  };

  const setChat = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  };
  const say = (content: string, links?: ChatMessage["links"]) =>
    setChat([...messagesRef.current, { role: "assistant", content, links }]);

  /** One request to Dino at a time (user messages and chain events are queued). */
  const ask = (input: { text?: string; event?: string }) => {
    queue.current = queue.current.then(async () => {
      const history = input.text ? [...messagesRef.current, { role: "user" as const, content: input.text }] : messagesRef.current;
      if (input.text) setChat(history);
      setBusy(true);
      if (input.event) react("think");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), event: input.event }),
        });
        const data = await res.json();
        say(data.reply ?? "Sorry, something went wrong.", data.links);
        if (data.card) setCard(data.card);
        if (data.mood === "happy") react("happy");
        if (data.actions?.some((a: { type: string }) => a.type === "open_game")) setTimeout(() => router.push("/play"), 1200);
        if (data.links?.length) refresh();
      } catch {
        say("I couldn't reach the server. Try again?");
      } finally {
        setBusy(false);
      }
    });
  };

  const onCard = async (action: CardAction) => {
    if (action.type === "pick") {
      // Picking an option from a list turns it into a single proposal.
      setCard({ ...action.card, limitLeft: state.limit.remaining } as Card);
      return;
    }
    if (action.type === "reject") {
      setCard(null);
      ask({ event: `The user rejected the proposal: ${describe(action.card)}.` });
      return;
    }
    const c = action.card;
    const body =
      c.kind === "trip"
        ? { kind: "trip", flightId: c.flight.id, museumTime: c.museum?.time ?? null }
        : c.kind === "museum"
          ? { kind: "museum", time: c.time }
          : c.kind === "product"
            ? { kind: "product", productId: c.product.id }
            : null;
    if (!body) return;
    setPaying(true);
    try {
      const res = await fetch("/api/cards/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setCard(null);
        say(data.message, data.links);
        react("happy");
        refresh();
      } else {
        setCard(null);
        say(`I couldn't pay for that: ${data.error ?? "unknown error"}.`);
      }
    } catch {
      say("I couldn't reach the server. Your card is still here, try again?");
    } finally {
      setPaying(false);
    }
  };

  useChainEvents((rows: HistoryRow[]) => {
    const mine = rows.filter((r) => r.user === wallet);
    for (const r of mine) {
      if (r.kind === "delay_refund" && !handledEvents.current.has(r.id)) {
        handledEvents.current.add(r.id);
        // Toast shows the fact; Dino acts on it (reschedules the museum) and posts in chat.
        ask({ event: r.note });
      }
    }
    if (mine.some((r) => r.kind === "delay_refund")) react("happy", "Refund received!");
    else if (mine.some((r) => r.kind === "bottle_recycled")) react("jump", "+0.50 credit");
    else if (mine.length) react("jump");
    if (rows.length) refresh();
  });

  return (
    <div className="agent-grid p-4 sm:p-6" data-expanded={expanded}>
      <section className="area-cal panel relative flex min-h-0 flex-col p-4">
        {expanded ? (
          <WeekCalendar events={state.calendar} className="min-h-0 flex-1" />
        ) : (
          <DayCalendar title="Today" events={state.calendar} hourHeight={34} className="min-h-0 flex-1" />
        )}
        <button
          className="icon-btn absolute top-2.5 right-2.5 hidden lg:inline-flex"
          onClick={toggleExpanded}
          aria-label={expanded ? "Collapse calendar" : "Expand calendar"}
          aria-pressed={expanded}
          title={expanded ? "Collapse calendar" : "Expand calendar"}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d={expanded ? collapseIcon : expandIcon} />
          </svg>
        </button>
      </section>

      <section className="area-dino pane-soft pane-rounded min-h-0">
        <Companion className="h-full" onOption={setDialog} />
      </section>

      <section className="area-chat panel flex min-h-0 flex-col p-4">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="title px-1 text-xl">Dino</h1>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button className="pill hover:bg-chip" onClick={() => setDialog("profile")} title="Your wallet">
              <span className="text-subtle">Wallet</span> <b className="num font-medium">{state.wallet.toFixed(2)}</b>
            </button>
            <span className="pill" title="Recycling credit (sustainable products only)">
              <span className="text-subtle">Credit</span> <b className="num font-medium">{state.credit.toFixed(2)}</b>
            </span>
            <button className="pill hover:bg-chip" onClick={() => setDialog("profile")} title="Daily spending limit">
              <span className="text-subtle">Limit</span>{" "}
              <b className="num font-medium">
                {state.limit.spent.toFixed(0)}/{state.limit.limit.toFixed(0)}
              </b>
            </button>
          </div>
        </header>
        <Chat
          messages={messages}
          onSend={(text) => {
            setCard(null);
            ask({ text });
          }}
          busy={busy}
          overlay={card ? <CardView card={card} busy={paying} onAction={onCard} onClose={() => setCard(null)} /> : null}
        />
      </section>

      <HistoryDialog open={dialog === "history"} onClose={() => setDialog(null)} />
      <IncidentDialog open={dialog === "incident"} onClose={() => setDialog(null)} />
      <ProfileDialog open={dialog === "profile"} onClose={() => setDialog(null)} state={state} wallet={wallet} onChanged={refresh} />
    </div>
  );
}
