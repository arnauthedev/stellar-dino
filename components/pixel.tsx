// Pixel sprites copied from dino-game/src/game.js (drawDino, drawCactus, drawSky).
// Drawn as SVG rects so they scale crisply. Do not import from dino-game/.

type SpriteProps = { className?: string; color?: string; title?: string };

/** The game's dino. viewBox origin matches drawDino(x=0, y=0). */
export function DinoSprite({
  className,
  color = "var(--color-dino)",
  title = "Dino",
  eyeClosed = false,
  legFrame = 0,
}: SpriteProps & { eyeClosed?: boolean; legFrame?: 0 | 1 | 2 }) {
  // legFrame 0 = both legs, 1/2 = alternate leg lifted (walk cycle)
  const backLeg = legFrame === 1 ? 33 : 36;
  const frontLeg = legFrame === 2 ? 33 : 36;
  return (
    <svg viewBox="0 0 52 43" className={`pixelated ${className ?? ""}`} role="img" aria-label={title}>
      <g fill={color}>
        <rect x="19" y="0" width="28" height="21" />
        <rect x="39" y="8" width="12" height="7" />
        <rect x="8" y="18" width="31" height="19" />
        <rect x="1" y="25" width="15" height="8" />
        <rect x="16" y={backLeg} width="7" height="7" />
        <rect x="32" y={frontLeg} width="7" height="7" />
      </g>
      <rect x="36" y={eyeClosed ? 8 : 6} width="4" height={eyeClosed ? 1 : 4} fill="var(--color-bg)" />
    </svg>
  );
}

export function CactusSprite({ className, color = "var(--color-cactus)", tall = false }: SpriteProps & { tall?: boolean }) {
  const h = tall ? 47 : 37;
  return (
    <svg viewBox={`0 0 25 ${h}`} className={`pixelated ${className ?? ""}`} aria-hidden="true">
      <g fill={color}>
        <rect x="8" y="0" width="10" height={h} />
        <rect x="0" y="14" width="8" height="8" />
        <rect x="0" y="14" width="5" height="19" />
        <rect x="18" y="8" width="7" height="8" />
        <rect x="21" y="8" width="4" height="19" />
      </g>
    </svg>
  );
}

export function CloudSprite({ className, color = "var(--color-cloud)" }: SpriteProps) {
  return (
    <svg viewBox="0 0 42 14" className={`pixelated ${className ?? ""}`} aria-hidden="true">
      <g fill={color}>
        <rect x="0" y="7" width="42" height="7" />
        <rect x="9" y="0" width="25" height="7" />
      </g>
    </svg>
  );
}

/** The game's dashed ground line. */
export function Ground({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="h-px bg-ground" />
      <div
        className="mt-2.5 h-0.5"
        style={{ backgroundImage: "linear-gradient(90deg, #e0e5ea 15px, transparent 15px)", backgroundSize: "40px 2px" }}
      />
    </div>
  );
}
