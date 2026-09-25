"use client";

import { useEffect, useState } from "react";
import { DinoSprite, Ground } from "@/components/pixel";

type Checkout = { product: { name: string; price: number; sustainable: boolean }; youPay: number; govPays: number; used: boolean };
type Result = { ok: true; userPaid: number; govPaid: number; explorerUrl: string; product: string } | { ok: false; message: string };

export function PayCheckout({ code }: { code: string }) {
  const [checkout, setCheckout] = useState<Checkout | null | "missing">(null);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/shop/pay?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : "missing"))
      .then((d) => alive && setCheckout(d))
      .catch(() => alive && setCheckout("missing"));
    return () => {
      alive = false;
    };
  }, [code]);

  const pay = async () => {
    setPaying(true);
    const res = await fetch("/api/shop/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setResult(res ? await res.json() : { ok: false, message: "Network error. Try again." });
    setPaying(false);
  };

  const ok = result?.ok;
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      <div className="w-full">
        <div className="flex justify-center">
          <DinoSprite pose={ok ? "walkA" : "stand"} className={`h-20 w-auto ${ok ? "animate-[hop_.6s_ease-out_2]" : ""}`} />
        </div>
        <Ground className="mt-0.5" />
      </div>
      {checkout === null && <p className="text-subtle">Loading…</p>}
      {checkout === "missing" && <p className="text-subtle">Unknown code. Scan the QR at the shop counter.</p>}
      {checkout && checkout !== "missing" && !result && (
        <>
          <p className="label">Airport shop</p>
          <h1 className="title text-3xl">{checkout.product.name}</h1>
          <div>
            <div className="num text-4xl">{checkout.youPay.toFixed(2)} USDC</div>
            {checkout.govPays > 0 && (
              <p className="mt-1 text-sm text-good">Government pays {checkout.govPays.toFixed(2)} from your recycling credit</p>
            )}
            {checkout.product.sustainable && <span className="badge badge-good mt-2">♻ Sustainable</span>}
          </div>
          {checkout.used ? (
            <p className="text-subtle">This code was already used. Scan the new QR at the counter.</p>
          ) : (
            <button className="btn btn-primary w-full" disabled={paying} onClick={pay}>
              {paying ? "Paying…" : "Pay with Dino wallet"}
            </button>
          )}
        </>
      )}
      {result?.ok && (
        <>
          <h1 className="title text-4xl">Paid</h1>
          <p className="text-subtle">
            {result.product}: you paid {result.userPaid.toFixed(2)} USDC
            {result.govPaid > 0 && `, the Government paid ${result.govPaid.toFixed(2)}`}.
          </p>
          <a className="text-sm text-accent-ink underline" href={result.explorerUrl} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </>
      )}
      {result && !result.ok && (
        <>
          <h1 className="title text-3xl">Payment failed</h1>
          <p className="text-subtle">{result.message}</p>
        </>
      )}
    </div>
  );
}
