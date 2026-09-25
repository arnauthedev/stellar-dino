// Pixel sprites in the Chrome Dino style, drawn as SVG rects so they scale crisply.
// Each sprite is a bitmap: "#" = ink, "o" = hole in background colour, "." = empty.
// Do not import from dino-game/.

type Bitmap = string[];

function PixelArt({
  bitmap,
  color,
  hole = "var(--color-bg)",
  className,
  label,
}: {
  bitmap: Bitmap;
  color: string;
  hole?: string;
  className?: string;
  label?: string;
}) {
  const width = Math.max(...bitmap.map((row) => row.length));
  const ink: React.ReactNode[] = [];
  const holes: React.ReactNode[] = [];
  bitmap.forEach((row, y) => {
    // merge horizontal runs into one rect each
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      if (ch === "#") ink.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} />);
      if (ch === "o") holes.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} />);
      x = end;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${bitmap.length}`}
      className={`pixelated ${className ?? ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <g fill={color}>{ink}</g>
      {holes.length > 0 && <g fill={hole}>{holes}</g>}
    </svg>
  );
}

/* ---------- Dino (classic T-Rex, 20 x 21) ---------- */

const DINO_HEAD: Bitmap = [
  "...........########.",
  "..........##o#######",
  "..........##########",
  "..........##########",
  "..........##########",
  "..........#####.....",
  "..........########..",
];
const DINO_HEAD_BLINK: Bitmap = DINO_HEAD.map((row, i) => (i === 1 ? row.replace("o", "#") : row));

const DINO_BODY: Bitmap = [
  "#........#####......",
  "#.......######......",
  "##....##########....",
  "###..#########.#....",
  "##############......",
  "##############......",
  ".############.......",
  "..###########.......",
  "...#########........",
  "....#######.........",
];

const DINO_LEGS = {
  stand: [
    ".....###.##.........",
    ".....##...#.........",
    ".....#....#.........",
    ".....##...##........",
  ],
  // back leg lifted
  walkA: [
    ".....###.##.........",
    ".....###..#.........",
    "..........#.........",
    "..........##........",
  ],
  // front leg lifted
  walkB: [
    ".....###.##.........",
    ".....##...##........",
    ".....#..............",
    ".....##.............",
  ],
} satisfies Record<string, Bitmap>;

export type DinoPose = keyof typeof DINO_LEGS;

export type DinoLook = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

const EYE = { x: 12, y: 1 };

/** Head with the eye hole moved 1px toward `look` (or closed when blinking). */
function dinoHead(blink: boolean, look?: DinoLook): Bitmap {
  if (blink) return DINO_HEAD_BLINK;
  if (!look || (look.x === 0 && look.y <= 0)) return DINO_HEAD;
  const ex = EYE.x + look.x;
  // Row 0 is the head's top edge: a hole there reads as a notch, so "up" keeps the eye on row 1.
  const ey = EYE.y + Math.max(0, look.y);
  return DINO_HEAD_BLINK.map((row, i) => (i === ey ? row.slice(0, ex) + "o" + row.slice(ex + 1) : row));
}

/** Overlay two rows: ink wins over empty, holes win over ink. */
function mergeRows(a: string, b: string): string {
  let out = "";
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ca = a[i] ?? ".";
    const cb = b[i] ?? ".";
    out += ca === "o" || cb === "o" ? "o" : ca === "#" || cb === "#" ? "#" : ".";
  }
  return out;
}

export function DinoSprite({
  className,
  color = "var(--color-dino)",
  pose = "stand",
  blink = false,
  label = "Dino",
  look,
  nod = false,
}: {
  className?: string;
  color?: string;
  pose?: DinoPose;
  blink?: boolean;
  label?: string;
  /** Move the eye 1px toward this direction (default: centred). */
  look?: DinoLook;
  /** Dip the head (first 7 rows) down by 1px. */
  nod?: boolean;
}) {
  const head = dinoHead(blink, look);
  const legs = DINO_LEGS[pose];
  const bitmap = nod
    ? [".".repeat(20), ...head.slice(0, -1), mergeRows(head[head.length - 1], DINO_BODY[0]), ...DINO_BODY.slice(1), ...legs]
    : [...head, ...DINO_BODY, ...legs];
  return <PixelArt bitmap={bitmap} color={color} className={className} label={label} />;
}

/* ---------- Cactus (13 x 19) ---------- */

const CACTUS: Bitmap = [
  ".....###.....",
  "....#####....",
  "....#####....",
  "....#####.##.",
  ".##.#####.###",
  "###.#####.###",
  "###.#####.###",
  "###.#####.###",
  "###.#####.###",
  "###.########.",
  "###.#######..",
  "###.#####....",
  ".########....",
  "..#######....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
  "....#####....",
];

export function CactusSprite({ className, color = "var(--color-cactus)" }: { className?: string; color?: string }) {
  return <PixelArt bitmap={CACTUS} color={color} className={className} />;
}

/* ---------- Pterodactyl (23 x 18, two wing frames) ---------- */

const BIRD_BODY: Bitmap = [
  "....##.................",
  "...#o#.................",
  "..####.................",
  "#####################..",
  ".....##################",
  "......###############..",
];

const BIRD_UP: Bitmap = [
  "........#..............",
  "........##.............",
  "........###............",
  "........####...........",
  "........#####..........",
  "........######.........",
  "....##..#######........",
  "...#o#..########.......",
  "..####..#########......",
  ...BIRD_BODY.slice(3),
  "........#########......",
  "......................",
  "......................",
  "......................",
  "......................",
  "......................",
];

const BIRD_DOWN: Bitmap = [
  ".......................",
  ".......................",
  ".......................",
  ".......................",
  ".......................",
  ".......................",
  ...BIRD_BODY,
  "........#########......",
  "........######.........",
  "........#####..........",
  "........####...........",
  "........###............",
  "........##.............",
];

export function BirdSprite({
  className,
  color = "var(--color-cactus)",
  wings = "up",
}: {
  className?: string;
  color?: string;
  wings?: "up" | "down";
}) {
  return <PixelArt bitmap={wings === "up" ? BIRD_UP : BIRD_DOWN} color={color} className={className} />;
}

/* ---------- Cloud (23 x 7, outlined) ---------- */

const CLOUD: Bitmap = [
  "..........######.......",
  "........###....##......",
  "......###.......###....",
  "..#####...........##...",
  ".##................###.",
  "##...................##",
  "#######################",
];

export function CloudSprite({ className, color = "var(--color-ground)" }: { className?: string; color?: string }) {
  return <PixelArt bitmap={CLOUD} color={color} className={className} />;
}

/* ---------- Ground (the game's line + dashes) ---------- */

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

/* ---------- Food (apple, 10 x 10) ---------- */

const APPLE_STEM: Bitmap = [
  ".....##...",
  "....##....",
  "..........",
];
const APPLE: Bitmap = [
  "..........",
  "..........",
  "..........",
  "..##.###..",
  ".########.",
  "##########",
  "##########",
  "##########",
  ".########.",
  "..######..",
];

export function FoodSprite({ className }: { className?: string }) {
  return (
    <span className={`relative inline-block ${className ?? ""}`} aria-hidden="true">
      <PixelArt bitmap={APPLE} color="var(--color-bad)" className="h-full w-auto" />
      <span className="absolute inset-0">
        <PixelArt bitmap={APPLE_STEM} color="var(--color-good)" className="h-[30%] w-auto" />
      </span>
    </span>
  );
}
