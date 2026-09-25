"use client";

import { useEffect, useRef, useState } from "react";
import { useCompanion } from "@/components/companion";
import { DinoSprite } from "@/components/pixel";

export type ChatMessage = { role: "user" | "assistant"; content: string; links?: { label: string; href: string }[] };

const SUGGESTIONS = [
  "Plan a trip to Paris tomorrow morning with a museum visit",
  "What can I buy with my recycling credit?",
  "Show my last payments",
];

export function Chat({
  messages,
  onSend,
  busy,
  overlay,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  busy: boolean;
  /** Shown over the messages (not over the input), e.g. a proposal card. */
  overlay?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { react } = useCompanion();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const send = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setText("");
    react("think");
    onSend(v);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col">
      {overlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 p-2 backdrop-blur-[2px] sm:p-4">
          {overlay}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1 py-3">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <p className="title text-2xl">Hi, I&apos;m Dino.</p>
            <p className="max-w-sm text-sm text-subtle">
              I plan and pay for your trip from your smart wallet, within your spending limit. Every payment is on Stellar testnet.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="btn btn-pill min-h-9! px-3.5! py-2! text-[13px]!" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[80%] rounded-[18px] bg-primary px-4 py-2.5 text-[15px] text-white">
              {m.content}
            </div>
          ) : (
            <div key={i} className="flex max-w-[85%] items-end gap-2">
              <DinoSprite className="mb-1 h-5 w-auto flex-none" />
              <div className="rounded-[18px] bg-muted px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
                {m.content}
                {m.links && m.links.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {m.links.map((l) => (
                      <a key={l.href} className="text-xs text-accent-ink underline" href={l.href} target="_blank" rel="noreferrer">
                        {l.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="flex items-end gap-2">
            <DinoSprite className="mb-1 h-5 w-auto flex-none" />
            <div className="rounded-[18px] bg-muted px-4 py-2.5 text-subtle">
              <span className="animate-pulse">Dino is thinking…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      </div>
      <form
        className="flex gap-2 pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          className="field"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message Dino…"
          aria-label="Message Dino"
        />
        <button className="btn btn-primary" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
