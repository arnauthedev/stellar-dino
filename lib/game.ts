import "server-only";
import { randomBytes } from "node:crypto";
import { broadcast, CHANNELS } from "@/lib/realtime";
import { getServerSupabase } from "@/lib/supabase/server";

// The single global Dino game. Its join code lives in Supabase (game_state).

function newCode(): string {
  // No 0/O/1/I to keep it readable when typed.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
}

export async function getGameCode(): Promise<string> {
  const { data, error } = await getServerSupabase().from("game_state").select("code").eq("id", 1).single();
  if (error) throw new Error(error.message);
  return data.code;
}

/** Clear all players and change the code, so old QR links stop working. */
export async function resetGame(): Promise<string> {
  const code = newCode();
  const { error } = await getServerSupabase()
    .from("game_state")
    .update({ code, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  await broadcast(CHANNELS.game, "reset", { code });
  return code;
}
