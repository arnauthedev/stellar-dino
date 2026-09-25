"use client";

import { useEffect, useRef, useState } from "react";
import { DinoSprite, Ground } from "@/components/pixel";

type Result =
  | { ok: true; credit: number; explorerUrl: string }
  | { ok: false; reason: string; message: string };

export function Claim({ code }: { code: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/recycle/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ ok: false, reason: "error", message: "Network error. Try scanning again." }));
  }, [code]);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="w-full">
        <div className="flex justify-center">
          <DinoSprite
            pose={result?.ok ? "walkA" : "stand"}
            className={`h-24 w-auto ${result?.ok ? "animate-[hop_.6s_ease-out_2]" : ""}`}
            color={result && !result.ok ? "var(--color-dead)" : "var(--color-dino)"}
          />
        </div>
        <Ground className="mt-0.5" />
      </div>
      {!result && (
        <>
          <h1 className="title text-3xl">Recycling…</h1>
          <p className="text-subtle">Recording your bottle on Stellar testnet.</p>
        </>
      )}
      {result?.ok && (
        <>
          <h1 className="title text-4xl">Bottle recycled</h1>
          <p className="num text-2xl text-good">+0.50 USDC credit</p>
          <p className="text-sm text-subtle">
            Your credit is now {result.credit.toFixed(2)} USDC. Use it on sustainable products at the airport shop.
          </p>
          <a className="text-sm text-accent-ink underline" href={result.explorerUrl} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </>
      )}
      {result && !result.ok && (
        <>
          <h1 className="title text-3xl">{result.reason === "no_bottle" ? "No bottle to recycle" : "Could not recycle"}</h1>
          <p className="text-subtle">{result.message}</p>
        </>
      )}
    </div>
  );
}
