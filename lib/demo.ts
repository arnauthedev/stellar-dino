import "server-only";
import { server } from "@/lib/stellar/core";
import { getServerSupabase } from "@/lib/supabase/server";

// Demo epoch: the ledger at the last "Reset demo". History starts here so each
// run of the demo begins with a clean list (on-chain data is never deleted).

export async function getResetLedger(): Promise<number> {
  const { data } = await getServerSupabase().from("demo_state").select("reset_ledger").eq("id", 1).single();
  return data?.reset_ledger ?? 0;
}

export async function markDemoReset(): Promise<number> {
  const { sequence } = await server.getLatestLedger();
  await getServerSupabase()
    .from("demo_state")
    .update({ reset_ledger: sequence, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return sequence;
}
