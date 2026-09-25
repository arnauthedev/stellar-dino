"use client";

import { useEffect, useState } from "react";
import { EXPLORER_URL } from "@/config/actors";
import { Dialog } from "@/components/dialog";
import { HistoryList } from "@/components/history-list";
import type { AgentState } from "@/lib/agent-state";
import type { HistoryRow } from "@/lib/stellar";

export function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/history", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => alive && setRows(d.rows ?? []))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title="Your transactions" wide>
      {rows === null ? (
        <p className="py-6 text-center text-sm text-subtle">Loading from Stellar testnet…</p>
      ) : (
        <HistoryList rows={rows} empty="No transactions yet. Ask Dino to book a trip." />
      )}
    </Dialog>
  );
}

export function ProfileDialog({
  open,
  onClose,
  state,
  wallet,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  state: AgentState;
  wallet: string;
  onChanged: () => void;
}) {
  const [limit, setLimit] = useState(String(state.limit.limit));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; href?: string } | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/wallet/limit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: Number(limit) }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Limit set to ${Number(limit).toFixed(2)} USDC per day.`, href: data.explorerUrl });
      onChanged();
    } else setMsg({ ok: false, text: data.error ?? "Could not change the limit." });
  };

  const stat = (label: string, value: string, muted?: boolean) => (
    <div className="flex flex-col gap-0.5">
      <span className="label text-[11px]!">{label}</span>
      <strong className={`num text-2xl font-medium ${muted ? "text-faint" : ""}`}>{value}</strong>
    </div>
  );

  return (
    <Dialog open={open} onClose={onClose} title="Your profile">
      <div className="space-y-6">
        <div>
          <div className="label mb-1 text-[11px]!">Smart wallet</div>
          <a className="num block break-all text-sm text-accent-ink underline" href={`${EXPLORER_URL}/contract/${wallet}`} target="_blank" rel="noreferrer">
            {wallet}
          </a>
          <p className="mt-1 text-xs text-subtle">OpenZeppelin smart account on Stellar testnet. Dino signs with its own key, only within your limit.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {stat("Balance", `${state.wallet.toFixed(2)} USDC`)}
          {stat("Recycling credit", state.credit.toFixed(2), state.credit === 0)}
          {stat("Spent today", state.limit.spent.toFixed(2))}
          {stat("Left today", state.limit.remaining.toFixed(2), true)}
        </div>
        <div>
          <label className="label mb-2 block text-[11px]!" htmlFor="limit">
            Daily spending limit (USDC)
          </label>
          <div className="flex gap-2">
            <input
              id="limit"
              className="field num"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <button className="btn btn-primary" onClick={save} disabled={saving || !(Number(limit) > 0)}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="mt-2 text-xs text-subtle">Only you can change it: this is signed with your own key, not Dino&apos;s.</p>
          {msg && (
            <p className={`mt-2 text-sm ${msg.ok ? "text-good" : "text-bad"}`}>
              {msg.text}{" "}
              {msg.href && (
                <a className="text-accent-ink underline" href={msg.href} target="_blank" rel="noreferrer">
                  View tx
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
