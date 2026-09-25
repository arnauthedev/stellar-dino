import "server-only";
import { randomBytes } from "node:crypto";
import { broadcast } from "@/lib/realtime";
import { buyProduct, getCredit, listProducts, type Product } from "@/lib/stellar";
import { getServerSupabase } from "@/lib/supabase/server";

// Airport shop checkout by QR: the counter shows a one-time code for a product;
// the user's phone opens it and pays from the smart wallet.

export const SHOP_CHANNEL = "shop-checkout";

export async function newShopCode(productId: string): Promise<string> {
  const code = randomBytes(9).toString("base64url");
  const { error } = await getServerSupabase().from("shop_codes").insert({ code, product_id: productId });
  if (error) throw new Error(error.message);
  return code;
}

export type Checkout = { product: Product; youPay: number; govPays: number; used: boolean };

export async function getCheckout(code: string): Promise<Checkout | null> {
  const { data } = await getServerSupabase().from("shop_codes").select("product_id, used_at").eq("code", code).maybeSingle();
  if (!data) return null;
  const [products, credit] = await Promise.all([listProducts(), getCredit()]);
  const product = products.find((p) => p.id === data.product_id);
  if (!product) return null;
  const govPays = product.sustainable ? Math.min(credit, product.price) : 0;
  return { product, youPay: product.price - govPays, govPays, used: !!data.used_at };
}

export type PayResult =
  | { ok: true; userPaid: number; govPaid: number; explorerUrl: string; product: string }
  | { ok: false; message: string };

export async function payShopCode(code: string): Promise<PayResult> {
  const db = getServerSupabase();
  const { data } = await db
    .from("shop_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .select("product_id");
  if (!data?.length) return { ok: false, message: "This code was already used or is unknown. Scan the QR at the counter again." };
  const productId = data[0].product_id as string;
  try {
    const r = await buyProduct(productId);
    await db.from("shop_codes").update({ tx_hash: r.txHash }).eq("code", code);
    const products = await listProducts();
    const name = products.find((p) => p.id === productId)?.name ?? productId;
    await broadcast(SHOP_CHANNEL, "paid", {
      code,
      product: name,
      userPaid: r.result.userPaid,
      govPaid: r.result.govPaid,
      explorerUrl: r.explorerUrl,
    });
    return { ok: true, userPaid: r.result.userPaid, govPaid: r.result.govPaid, explorerUrl: r.explorerUrl, product: name };
  } catch (err) {
    await db.from("shop_codes").update({ used_at: null }).eq("code", code);
    return { ok: false, message: err instanceof Error ? err.message.replace(/^buy failed: /, "") : String(err) };
  }
}
