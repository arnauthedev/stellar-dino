import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { CactusSprite, CloudSprite, DinoSprite, Ground } from "@/components/pixel";

export const dynamic = "force-dynamic";

// The game build is served from /game/ (npm run build:game copies it to public/game).
// Production builds set NEXT_PUBLIC_GAME_AVAILABLE; in dev we check the folder.
function gameAvailable(): boolean {
  return process.env.NEXT_PUBLIC_GAME_AVAILABLE === "1" || existsSync(join(process.cwd(), "public", "game", "index.html"));
}

export default async function PlayPage({ searchParams }: PageProps<"/play">) {
  const { g } = await searchParams;
  const code = typeof g === "string" ? g : "";

  if (!gameAvailable()) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="relative w-full max-w-md">
          <CloudSprite className="absolute -top-6 left-10 h-3 w-auto" />
          <div className="flex items-end justify-between px-8">
            <DinoSprite className="h-20 w-auto" />
            <CactusSprite className="h-14 w-auto" />
          </div>
          <Ground className="mt-0.5" />
        </div>
        <h1 className="title text-3xl">Motion Dino is coming soon</h1>
        <p className="max-w-sm text-subtle">The multiplayer game will appear here shortly. Jump in front of the camera to play.</p>
        {!code && (
          <Link className="btn" href="/agent">
            Back to Dino
          </Link>
        )}
      </main>
    );
  }

  return (
    <main className="fixed inset-0">
      <iframe
        src={`/game/index.html${code ? `?g=${encodeURIComponent(code)}` : ""}`}
        title="Motion Dino"
        allow="camera; fullscreen; autoplay"
        className="size-full border-0"
      />
      {!code && (
        <Link href="/agent" className="icon-btn fixed bottom-6 right-6 z-10" aria-label="Back to Dino" title="Back to Dino">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      )}
    </main>
  );
}
