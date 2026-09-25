// Chrome-style pixel sprites (copied from the app's components/pixel.tsx bitmaps).
// "#" = ink, "o" = hole in background colour, "." = empty.

export const BACKGROUND = "#fafbfc";

const DINO_HEAD = [
  "...........########.",
  "..........##o#######",
  "..........##########",
  "..........##########",
  "..........##########",
  "..........#####.....",
  "..........########..",
];
const DINO_HEAD_BLINK = DINO_HEAD.map((row, i) => (i === 1 ? row.replace("o", "#") : row));

const DINO_BODY = [
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
  walkA: [
    ".....###.##.........",
    ".....###..#.........",
    "..........#.........",
    "..........##........",
  ],
  walkB: [
    ".....###.##.........",
    ".....##...##........",
    ".....#..............",
    ".....##.............",
  ],
};

const CACTUS = [
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

const BIRD_BODY = [
  "....##.................",
  "...#o#.................",
  "..####.................",
  "#####################..",
  ".....##################",
  "......###############..",
];

const BIRD_UP = [
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
  ".......................",
  ".......................",
  ".......................",
  ".......................",
  ".......................",
];

const BIRD_DOWN = [
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

const CLOUD = [
  "..........######.......",
  "........###....##......",
  "......###.......###....",
  "..#####...........##...",
  ".##................###.",
  "##...................##",
  "#######################",
];

// Pre-merge each bitmap into horizontal runs so drawing is one fillRect per run.
function compile(bitmap) {
  const ink = [];
  const holes = [];
  bitmap.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      if (ch === "#") ink.push([x, y, end - x]);
      else if (ch === "o") holes.push([x, y, end - x]);
      x = end;
    }
  });
  return { ink, holes, width: Math.max(...bitmap.map((row) => row.length)), height: bitmap.length };
}

function dinoFrames(head) {
  return Object.fromEntries(Object.entries(DINO_LEGS).map(([pose, legs]) => [pose, compile([...head, ...DINO_BODY, ...legs])]));
}

export const SPRITES = {
  dino: dinoFrames(DINO_HEAD),
  dinoBlink: dinoFrames(DINO_HEAD_BLINK),
  cactus: compile(CACTUS),
  birdUp: compile(BIRD_UP),
  birdDown: compile(BIRD_DOWN),
  cloud: compile(CLOUD),
};

function fillRuns(ctx, runs, x, y, sx, sy) {
  for (const [rx, ry, len] of runs) {
    // Round both edges so neighbouring runs meet exactly (no seams, crisp pixels).
    const left = Math.round(x + rx * sx);
    const top = Math.round(y + ry * sy);
    ctx.fillRect(left, top, Math.round(x + (rx + len) * sx) - left, Math.round(y + (ry + 1) * sy) - top);
  }
}

// Draw a compiled sprite with its top-left at (x, y), each bitmap pixel sx × sy canvas pixels.
export function drawSprite(ctx, sprite, x, y, sx, sy = sx, ink, hole = BACKGROUND) {
  ctx.fillStyle = ink;
  fillRuns(ctx, sprite.ink, x, y, sx, sy);
  if (sprite.holes.length) {
    ctx.fillStyle = hole;
    fillRuns(ctx, sprite.holes, x, y, sx, sy);
  }
}
