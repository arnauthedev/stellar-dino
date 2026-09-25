"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChainEvents } from "@/components/live";
import { DinoSprite, Ground } from "@/components/pixel";
import { Qr } from "@/components/qr";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Status = { credit: number; bottles: { bought: number; recycled: number; unrecycled: number } };
type Success = { credit: number; explorerUrl?: string };

export function RecycleMachine() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const codeRef = useRef("");

  const rotate = useCallback(async () => {
    const res = await fetch("/api/recycle/code", { method: "POST" });
    if (res.ok) {
      const { code } = await res.json();
      codeRef.current = code;
      setCode(code);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/recycle/status", { cache: "no-store" });
    if (res.ok) setStatus(await res.json());
  }, []);

  const celebrate = useCallback(
    (s: Success) => {
      setSuccess(s);
      refreshStatus();
      setTimeout(() => {
        setSuccess(null);
        rotate();
      }, 3500);
    },
    [refreshStatus, rotate],
  );

  // First code + status once mounted (async, so no synchronous setState in the effect).
  useEffect(() => {
    const first = setTimeout(() => {
      rotate();
      refreshStatus();
    }, 0);
    return () => clearTimeout(first);
  }, [rotate, refreshStatus]);

  // Instant update from the claim API.
  useEffect(() => {
    const channel = getBrowserSupabase()
      .channel("recycle-machine")
      .on("broadcast", { event: "recycled" }, ({ payload }) => {
        if (payload.code === codeRef.current) celebrate({ credit: payload.credit, explorerUrl: payload.explorerUrl });
      })
      .subscribe();
    return () => void getBrowserSupabase().removeChannel(channel);
  }, [celebrate]);

  // Backup: chain events (also covers purchases changing the bottle count).
  useChainEvents((rows) => {
    if (rows.some((r) => r.kind === "product_sold" || r.kind === "bottle_recycled")) refreshStatus();
  });

  // code is only set client-side (after fetch), so window is available here.
  const link = code ? `${window.location.origin}/recycle?code=${code}` : "";

  return (
    <div className="grid overflow-hidden rounded-card border border-line lg:grid-cols-[1.1fr_1fr]">
      <div className="pane relative flex flex-col items-center justify-center gap-5 px-6 py-10">
        {success ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <DinoSprite pose="walkA" className="h-24 w-auto animate-[hop_.6s_ease-out_2]" />
            <h2 className="title text-4xl">Bottle recycled</h2>
            <p className="num text-2xl text-good">+0.50 USDC credit</p>
            <p className="text-sm text-subtle">Total credit {success.credit.toFixed(2)} USDC · for sustainable products</p>
            {success.explorerUrl && (
              <a className="text-sm text-accent-ink underline" href={success.explorerUrl} target="_blank" rel="noreferrer">
                View tx
              </a>
            )}
          </div>
        ) : (
          <>
            <p className="label">Scan with your phone camera</p>
            <div className="rounded-card bg-white p-4 shadow-[var(--shadow-float)]">
              {link ? <Qr value={link} size={300} /> : <div className="size-[300px] animate-pulse rounded-ctl bg-chip" />}
            </div>
            <p className="max-w-xs text-center text-sm text-subtle">
              One scan recycles one bottle bought at the airport shop. The code changes after each scan.
            </p>
          </>
        )}
      </div>
      <div className="pane-well flex flex-col justify-between gap-8 p-8">
        <div>
          <h2 className="title text-3xl">Recycling machine</h2>
          <p className="mt-1 text-sm text-subtle">Run by the recycling business. Each bottle earns a fixed 0.50 USDC credit, paid by the government.</p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-1">
            <span className="label">Your credit</span>
            <strong className="num text-4xl font-medium">{status ? status.credit.toFixed(2) : "–"}</strong>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label">Bottles to recycle</span>
            <strong className="num text-4xl font-medium">{status ? status.bottles.unrecycled : "–"}</strong>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label">Bought</span>
            <strong className="num text-2xl font-medium text-faint">{status?.bottles.bought ?? "–"}</strong>
          </div>
          <div className="flex flex-col gap-1">
            <span className="label">Recycled</span>
            <strong className="num text-2xl font-medium text-faint">{status?.bottles.recycled ?? "–"}</strong>
          </div>
        </div>
        <div>
          <div className="flex items-end justify-around px-6">
            <DinoSprite className="h-12 w-auto" />
          </div>
          <Ground className="mt-0.5" />
        </div>
      </div>
    </div>
  );
}
