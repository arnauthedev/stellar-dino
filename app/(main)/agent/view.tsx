"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Chat, type ChatMessage } from "@/components/chat";
import { Companion, CompanionProvider, useCompanion, type CompanionOption } from "@/components/companion";
import { HistoryDialog, IncidentDialog, ProfileDialog } from "@/components/companion-dialogs";
import { DayCalendar } from "@/components/day-calendar";
import { useChainEvents } from "@/components/live";
import type { AgentState } from "@/lib/agent-state";
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

function AgentLayout({ initial, wallet }: { initial: AgentState; wallet: string }) {
  const [state, setState] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<"chat" | "shop">("chat");
  const [dialog, setDialog] = useState<Exclude<CompanionOption, "food"> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
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
        setChat([...messagesRef.current, { role: "assistant", content: data.reply ?? "Sorry, something went wrong.", links: data.links }]);
        if (data.mood === "happy") react("happy");
        if (data.actions?.some((a: { type: string }) => a.type === "open_game")) setTimeout(() => router.push("/play"), 1200);
        if (data.links?.length) refresh();
      } catch {
        setChat([...messagesRef.current, { role: "assistant", content: "I couldn't reach the server. Try again?" }]);
      } finally {
        setBusy(false);
      }
    });
  };

  const send = (text: string) => ask({ text });

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
    <div className="agent-grid px-4 pb-4 sm:px-6" data-expanded={expanded}>
      <section className="area-cal panel relative flex min-h-0 flex-col p-4">
        <DayCalendar title="Today" events={state.calendar} hourHeight={expanded ? 44 : 34} className="min-h-0 flex-1" />
        <button
          className={`icon-btn absolute hidden lg:inline-flex ${expanded ? "top-2.5 right-2.5" : "right-3 bottom-3"}`}
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
          <div className="segments" role="tablist" aria-label="Panel">
            <button className="segment" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
              Chat with Dino
            </button>
            <button className="segment" role="tab" aria-selected={tab === "shop"} onClick={() => setTab("shop")}>
              Airport shop
            </button>
          </div>
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
        {tab === "chat" ? (
          <Chat messages={messages} onSend={send} busy={busy} />
        ) : (
          <Shop state={state} onBought={refresh} />
        )}
      </section>

      <HistoryDialog open={dialog === "history"} onClose={() => setDialog(null)} />
      <IncidentDialog open={dialog === "incident"} onClose={() => setDialog(null)} />
      <ProfileDialog open={dialog === "profile"} onClose={() => setDialog(null)} state={state} wallet={wallet} onChanged={refresh} />
    </div>
  );
}

function Shop({ state, onBought }: { state: AgentState; onBought: () => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; ok: boolean; text: string; href?: string } | null>(null);
  const { react } = useCompanion();

  const buy = async (id: string) => {
    setPending(id);
    setResult(null);
    const res = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    });
    const data = await res.json();
    setPending(null);
    if (res.ok) {
      const r = data.result as { userPaid: number; govPaid: number };
      setResult({
        id,
        ok: true,
        text: r.govPaid > 0 ? `You paid ${r.userPaid.toFixed(2)}, Government paid ${r.govPaid.toFixed(2)}` : `Paid ${r.userPaid.toFixed(2)} USDC`,
        href: data.explorerUrl,
      });
      react("jump");
      onBought();
    } else {
      setResult({ id, ok: false, text: data.error ?? "Payment failed" });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pt-4">
      <p className="mb-4 text-sm text-subtle">
        {state.credit > 0 ? (
          <>
            Your recycling credit of <b className="num text-ink">{state.credit.toFixed(2)} USDC</b> applies to{" "}
            <span className="badge badge-good">♻ Sustainable</span> products only. The government pays that part.
          </>
        ) : (
          <>Recycle a bottle bought here to earn 0.50 USDC credit for sustainable products.</>
        )}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {state.products.map((p) => {
          const credit = p.sustainable ? Math.min(state.credit, p.price) : 0;
          return (
            <li key={p.id} className="flex flex-col gap-2 rounded-ctl bg-field p-3.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {p.sustainable ? <span className="badge badge-good">♻ Sustainable</span> : <span className="badge">Full price</span>}
                    {p.bottle && <span className="badge">Recyclable bottle</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num text-lg">{(p.price - credit).toFixed(2)}</div>
                  {credit > 0 && <div className="num text-xs text-faint line-through">{p.price.toFixed(2)}</div>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-primary min-h-9! px-3.5! py-1.5!" disabled={!!pending} onClick={() => buy(p.id)}>
                  {pending === p.id ? "Paying…" : "Buy"}
                </button>
                {result?.id === p.id && (
                  <span className={`text-xs ${result.ok ? "text-good" : "text-bad"}`}>
                    {result.text}{" "}
                    {result.href && (
                      <a className="text-accent-ink underline" href={result.href} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    )}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
