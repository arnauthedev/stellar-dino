import "server-only";
import { randomBytes } from "node:crypto";
import { broadcast, CHANNELS } from "@/lib/realtime";
import { recordRecycling } from "@/lib/stellar";
import { getServerSupabase } from "@/lib/supabase/server";

// One-time recycling codes shown as a QR on the machine. Each scan uses the
// code, records the bottle on-chain, and the machine rotates to a new code.

export async function newRecycleCode(): Promise<string> {
  const code = randomBytes(9).toString("base64url");
  const { error } = await getServerSupabase().from("recycle_codes").insert({ code });
  if (error) throw new Error(error.message);
  return code;
}

export type ClaimResult =
  | { ok: true; credit: number; txHash: string; explorerUrl: string }
  | { ok: false; reason: "used" | "unknown" | "no_bottle" | "error"; message: string };

export async function claimRecycleCode(code: string): Promise<ClaimResult> {
  const db = getServerSupabase();
  // Atomically take the code: only one scan can win.
  const { data, error } = await db
    .from("recycle_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_at", null)
    .select("code");
  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data?.length) {
    const { data: existing } = await db.from("recycle_codes").select("code").eq("code", code);
    return existing?.length
      ? { ok: false, reason: "used", message: "This code was already used. Scan the new QR on the machine." }
      : { ok: false, reason: "unknown", message: "Unknown code. Scan the QR on the machine." };
  }

  try {
    const r = await recordRecycling();
    await db.from("recycle_codes").update({ tx_hash: r.txHash }).eq("code", code);
    await broadcast(CHANNELS.recycle, "recycled", { code, credit: r.result.credit, explorerUrl: r.explorerUrl });
    return { ok: true, credit: r.result.credit, txHash: r.txHash, explorerUrl: r.explorerUrl };
  } catch (err) {
    // Give the code back so the user can retry after buying a bottle.
    await db.from("recycle_codes").update({ used_at: null }).eq("code", code);
    const message = err instanceof Error ? err.message : String(err);
    if (/No unrecycled bottle/.test(message)) {
      return {
        ok: false,
        reason: "no_bottle",
        message:
          "Nothing to recycle: only single-use Water bottles bought at the airport shop can be recycled, one per bottle. Reusable items like the Bamboo bottle are not recycled. Buy a Water bottle first.",
      };
    }
    return { ok: false, reason: "error", message };
  }
}
