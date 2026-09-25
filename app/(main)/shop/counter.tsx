"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DinoSprite, Ground } from "@/components/pixel";
import { Qr } from "@/components/qr";
import type { Product } from "@/lib/stellar";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Sale = { product: string; userPaid: number; govPaid: number; explorerUrl: string };

export function ShopCounter({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState(products.find((p) => p.bottle)?.id ?? products[0]?.id);
  const [code, setCode] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const codeRef = useRef("");
  const product = products.find((p) => p.id === productId);

  const rotate = useCallback(async (id: string | undefined) => {
    if (!id) return;
    const res = await fetch("/api/shop/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: id }),
    });
    if (res.ok) {
      const { code } = await res.json();
      codeRef.current = code;
      setCode(code);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => rotate(productId), 0);
    return () => clearTimeout(t);
  }, [productId, rotate]);

  useEffect(() => {
    const channel = getBrowserSupabase()
      .channel("shop-checkout")
      .on("broadcast", { event: "paid" }, ({ payload }) => {
        if (payload.code !== codeRef.current) return;
        setSale(payload as Sale);
        setTimeout(() => {
          setSale(null);
          rotate(productId);
        }, 4000);
      })
      .subscribe();
    return () => void getBrowserSupabase().removeChannel(channel);
  }, [productId, rotate]);

  const link = code ? `${window.location.origin}/pay?code=${code}` : "";

  return (
    <div className="grid overflow-hidden rounded-card border border-line lg:grid-cols-[1.1fr_1fr]">
      <div className="pane flex flex-col items-center justify-center gap-5 px-6 py-10">
        {sale ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <DinoSprite pose="walkA" className="h-24 w-auto animate-[hop_.6s_ease-out_2]" />
            <h2 className="title text-4xl">Paid</h2>
            <p className="text-lg">{sale.product}</p>
            <p className="num text-subtle">
              Customer {sale.userPaid.toFixed(2)} USDC
              {sale.govPaid > 0 && <> · Government {sale.govPaid.toFixed(2)} USDC</>}
            </p>
            <a className="text-sm text-accent-ink underline" href={sale.explorerUrl} target="_blank" rel="noreferrer">
              View tx
            </a>
          </div>
        ) : (
          <>
            <p className="label">Scan to pay with your Dino wallet</p>
            <div className="rounded-card bg-white p-4 shadow-[var(--shadow-float)]">
              {link ? <Qr value={link} size={280} /> : <div className="size-[280px] animate-pulse rounded-ctl bg-chip" />}
            </div>
            {product && (
              <p className="text-center">
                <span className="text-lg font-medium">{product.name}</span>{" "}
                <span className="num text-subtle">{product.price.toFixed(2)} USDC</span>
              </p>
            )}
          </>
        )}
      </div>
      <div className="pane-well flex flex-col gap-6 p-8">
        <div>
          <h1 className="title text-3xl">Airport shop</h1>
          <p className="mt-1 text-sm text-subtle">Pick a product; the customer scans the QR and pays from their smart wallet. Recycling credit applies to sustainable products only.</p>
        </div>
        <ul className="grid gap-2">
          {products.map((p) => (
            <li key={p.id}>
              <button
                className={`flex w-full items-center gap-3 rounded-ctl px-4 py-3 text-left ${p.id === productId ? "bg-white shadow-[var(--shadow-soft)]" : "bg-field hover:bg-muted-hover"}`}
                onClick={() => setProductId(p.id)}
                aria-pressed={p.id === productId}
              >
                <span className="flex-1 font-medium">{p.name}</span>
                {p.sustainable ? <span className="badge badge-good">♻ Sustainable</span> : p.bottle ? <span className="badge">Recyclable bottle</span> : null}
                <span className="num w-16 text-right">{p.price.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <Ground />
        </div>
      </div>
    </div>
  );
}
