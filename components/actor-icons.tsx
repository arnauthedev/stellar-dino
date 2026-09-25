// Small pixel icons for the actors console, drawn like components/pixel.tsx:
// each icon is a bitmap where "#" = ink and "." = empty, merged into SVG rect runs.
import { DinoSprite } from "@/components/pixel";

type Bitmap = string[];

function Pixels({ bitmap, color, className, label }: { bitmap: Bitmap; color: string; className?: string; label?: string }) {
  const width = Math.max(...bitmap.map((row) => row.length));
  const rects: React.ReactNode[] = [];
  bitmap.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      let end = x;
      while (end < row.length && row[end] === row[x]) end++;
      if (row[x] === "#") rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={end - x} height={1} />);
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
      <g fill={color}>{rects}</g>
    </svg>
  );
}

/* Government: domed capitol with a flag (17 x 15) */
const GOVERNMENT: Bitmap = [
  "........####.....",
  "........###......",
  "........#........",
  "........#........",
  "......#####......",
  ".....#######.....",
  "....#########....",
  "..#############..",
  "..#############..",
  "..#.#.#.#.#.#.#..",
  "..#.#.#.#.#.#.#..",
  "..#.#.#.#.#.#.#..",
  "..#############..",
  "#################",
  "#################",
];

/* Recycling bin with a hollow triangle (16 x 15) */
const RECYCLER: Bitmap = [
  "......####......",
  "......#..#......",
  "################",
  "################",
  "................",
  ".##############.",
  ".######..######.",
  ".#####....#####.",
  ".####..##..####.",
  ".###..####..###.",
  ".###........###.",
  ".##############.",
  "..############..",
  "..############..",
  "...##########...",
];

/* Shopping bag with handles (16 x 15) */
const SHOP: Bitmap = [
  ".....######.....",
  "....##....##....",
  "....#......#....",
  "....#......#....",
  ".##############.",
  ".###.######.###.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  "..############..",
];

/* Plane seen from above (16 x 14) */
const AIRLINE: Bitmap = [
  ".......##.......",
  "......####......",
  "......####......",
  "......####......",
  ".....######.....",
  "...##########...",
  ".##############.",
  "################",
  "......####......",
  "......####......",
  ".......##.......",
  ".....######.....",
  "....########....",
  "................",
];

/* Museum: classical temple with pediment and columns (17 x 15) */
const MUSEUM: Bitmap = [
  "........#........",
  "......#####......",
  "....####.####....",
  "..#############..",
  "#################",
  ".................",
  ".##..##...##..##.",
  ".##..##...##..##.",
  ".##..##...##..##.",
  ".##..##...##..##.",
  ".##..##...##..##.",
  ".................",
  ".###############.",
  "#################",
  "#################",
];

type IconProps = { className?: string; color?: string; label?: string };

export function UserIcon({ className, color = "var(--color-dino)", label = "User" }: IconProps) {
  return <DinoSprite className={className} color={color} label={label} />;
}
export function GovernmentIcon({ className, color = "var(--color-p-blue)", label }: IconProps) {
  return <Pixels bitmap={GOVERNMENT} color={color} className={className} label={label} />;
}
export function RecyclerIcon({ className, color = "var(--color-p-teal)", label }: IconProps) {
  return <Pixels bitmap={RECYCLER} color={color} className={className} label={label} />;
}
export function ShopIcon({ className, color = "var(--color-p-sand)", label }: IconProps) {
  return <Pixels bitmap={SHOP} color={color} className={className} label={label} />;
}
export function AirlineIcon({ className, color = "var(--color-p-plum)", label }: IconProps) {
  return <Pixels bitmap={AIRLINE} color={color} className={className} label={label} />;
}
export function MuseumIcon({ className, color = "var(--color-p-violet)", label }: IconProps) {
  return <Pixels bitmap={MUSEUM} color={color} className={className} label={label} />;
}
