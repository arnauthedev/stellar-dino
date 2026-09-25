import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";

// Supabase Realtime broadcast channels shared by the server and browsers.
export const CHANNELS = { game: "dino-game", recycle: "recycle-machine" } as const;

/** Server -> browsers broadcast over HTTP (no websocket needed on Vercel). */
export async function broadcast(channel: string, event: string, payload: Record<string, unknown>) {
  const res = await getServerSupabase().channel(channel).httpSend(event, payload);
  if (!res.success) console.error(`broadcast ${channel}/${event} failed:`, res.error);
}
