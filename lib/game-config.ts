import "server-only";

/** Public Realtime settings the game needs (publishable key only). */
export function realtimeConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
