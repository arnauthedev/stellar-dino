import { SPRITES, drawSprite, BACKGROUND } from "./sprites.js";

const WIDTH = 960;
const COLORS = ["#343b43", "#4876bb", "#9a6583", "#8d714c", "#507b74", "#6e68a0"];

function hash(n) {
  const x = Math.sin(n * 127.1 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function obstacleTime(index) {
  return 1.35 + index * 1.62 + hash(index + 11) * 0.44;
}

export class DinoGame {
  constructor(canvas, onUpdate) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onUpdate = onUpdate;
    this.local = new Map();
    this.remote = [];
    this.startedAt = null;
    this.state = "idle";
    this.best = Number(localStorage.getItem("motion-dino-best") || 0);
    this.lastFrame = performance.now();
    this.lastUi = 0;
    requestAnimationFrame((time) => this.frame(time));
  }

  setLocalPlayers(players) {
    const ids = new Set(players.map((player) => player.id));
    for (const [id] of this.local) if (!ids.has(id)) this.local.delete(id);
    for (const player of players) {
      if (!this.local.has(player.id)) this.local.set(player.id, { ...player, height: 0, velocity: 0, alive: true, score: 0 });
      else this.local.get(player.id).name = player.name;
    }
  }

  setRemotePlayers(players) { this.remote = players; }

  start(startedAt = Date.now(), openingJump = null) {
    this.startedAt = startedAt;
    this.state = startedAt <= Date.now() ? "running" : "countdown";
    for (const player of this.local.values()) Object.assign(player, { height: 0, velocity: 0, alive: true, score: 0 });
    this.openingJump = openingJump;
    if (this.state === "running" && openingJump) { this.jump(openingJump); this.openingJump = null; }
    this.onUpdate();
  }

  jump(id) {
    const player = this.local.get(id);
    if (!player || !player.alive || this.state !== "running" || player.height > 0 || player.velocity !== 0) return;
    player.velocity = 610;
  }

  localState() {
    return [...this.local.values()].map((player) => ({ id: player.id, name: player.name, score: player.score, alive: player.alive, jump: Math.min(1, player.height / 105) }));
  }

  frame(now) {
    const dt = Math.min(0.045, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.startedAt && Date.now() >= this.startedAt && this.state === "countdown") {
      this.state = "running";
      if (this.openingJump) { this.jump(this.openingJump); this.openingJump = null; }
    }
    const elapsed = this.startedAt ? Math.max(0, (Date.now() - this.startedAt) / 1000) : 0;
    const players = [...this.local.values(), ...this.remote.map((player) => ({ ...player, height: (player.jump || 0) * 105, remote: true }))];
    const count = Math.max(1, players.length);
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const height = Math.max(count * 160, Math.round(WIDTH * rect.height / Math.max(1, rect.width)));
    const laneHeight = height / count;
    if (this.canvas.width !== WIDTH || this.canvas.height !== height) {
      this.canvas.width = WIDTH; this.canvas.height = height;
    }
    const ctx = this.ctx;
    ctx.fillStyle = "#fafbfc"; ctx.fillRect(0, 0, WIDTH, height);
    this.drawSky(ctx, elapsed, height);
    const obstacles = this.state === "running" ? this.obstacles(elapsed) : [];
    // View zoom when few players (drawing only: physics, timing and collisions are
    // unchanged). The dino is shifted left so more of the track ahead stays visible.
    const zoom = count === 1 ? 1.3 : count === 2 ? 1.15 : 1;
    const offset = zoom === 1 ? 0 : 105 - 40 / zoom;
    players.forEach((player, index) => {
      const ground = index * laneHeight + laneHeight * 0.68;
      this.drawBird(ctx, ground - laneHeight * 0.68, ground, index, now);
      const view = { zoom, offset };
      this.drawLane(ctx, ground, index, elapsed, view);
      if (!player.remote && this.state === "running" && player.alive) {
        player.height = Math.max(0, player.height + player.velocity * dt);
        player.velocity -= 1740 * dt;
        if (player.height === 0) player.velocity = 0;
        player.score = Math.floor(elapsed * 10);
        if (player.score > this.best) {
          this.best = player.score;
          localStorage.setItem("motion-dino-best", String(this.best));
        }
        for (const obstacle of obstacles) {
          if (obstacle.x < 144 && obstacle.x + obstacle.width > 96 && player.height < obstacle.height - 10) {
            player.alive = false;
            break;
          }
        }
      }
      for (const obstacle of obstacles) this.drawCactus(ctx, obstacle.x, ground, obstacle.height, view);
      this.drawDino(ctx, 105, ground, player.height, COLORS[index % COLORS.length], player.alive, elapsed, player.height > 0, now + index * 1700, view);
      if (players.length > 1) {
        ctx.fillStyle = "#6c747e"; ctx.font = "14px ui-monospace, monospace";
        ctx.fillText(player.name || `Player ${index + 1}`, 22, ground - 65);
        ctx.textAlign = "right"; ctx.fillText(String(player.score || 0).padStart(5, "0"), WIDTH - 22, ground - 65); ctx.textAlign = "left";
      }
    });
    if (this.state === "running" && this.local.size && [...this.local.values()].every((player) => !player.alive)) this.state = "over";
    if (now - this.lastUi > 200) { this.onUpdate(); this.lastUi = now; }
    requestAnimationFrame((time) => this.frame(time));
  }

  obstacles(elapsed) {
    const result = [];
    const first = Math.max(0, Math.floor((elapsed - 6) / 1.62));
    const last = Math.ceil(elapsed / 1.5) + 2;
    for (let index = first; index <= last; index++) {
      const x = WIDTH + 30 - (elapsed - obstacleTime(index)) * 280;
      if (x > -40 && x < WIDTH + 40) result.push({ x, width: 24, height: index % 4 === 3 ? 47 : 37 });
    }
    return result;
  }

  drawSky(ctx, elapsed, height) {
    const cloud = SPRITES.cloud;
    for (let i = 0; i < 3; i++) {
      const x = ((i * 228 - elapsed * 12) % 1100 + 1100) % 1100 - 70;
      const y = height * 0.3 + (i % 3) * 36;
      drawSprite(ctx, cloud, x, Math.round(y - 14), 2, 2, "#dde2e7");
    }
  }

  // Decorative pterodactyl gliding slowly across the top of each lane (never collides).
  drawBird(ctx, laneTop, ground, index, now) {
    const t = now / 1000 + index * 7.3;
    const span = WIDTH + 160;
    const x = WIDTH + 40 - ((t * 38 + index * 311) % span);
    const y = Math.max(laneTop + 4, ground - 170) + Math.round(Math.sin(t * 1.3) * 3);
    const sprite = Math.floor(t * 4) % 2 ? SPRITES.birdDown : SPRITES.birdUp;
    drawSprite(ctx, sprite, x, Math.round(y), 1.4, 1.4, "#b3bac2");
  }

  // view = { zoom, offset }: screen x = (world x - offset) * zoom; heights above the
  // ground line are multiplied by zoom. Pixel sizes are scaled, not the canvas, so
  // sprite edges stay on whole pixels.
  drawLane(ctx, ground, index, elapsed, view) {
    const z = view.zoom;
    ctx.fillStyle = "#d5dbe1"; ctx.fillRect(0, Math.round(ground + 2), WIDTH, 1);
    ctx.fillStyle = "#e0e5ea";
    const step = 40 * z;
    for (let x = -((elapsed * 80 * z) % step); x < WIDTH; x += step) ctx.fillRect(Math.round(x), Math.round(ground + 2 + 10 * z), Math.round(15 * z), 2);
  }

  drawCactus(ctx, x, ground, height, view) {
    // Scale the 13x19 bitmap to the obstacle box; the taller cactus is also a bit wider.
    const z = view.zoom;
    const sprite = SPRITES.cactus;
    const sy = (height / sprite.height) * z;
    const sx = (height > 40 ? 2.2 : 2) * z;
    const left = (x + 12 - view.offset) * z - (sprite.width * sx) / 2;
    drawSprite(ctx, sprite, Math.round(left), Math.round(ground + 2 - height * z), sx, sy, "#68727c");
  }

  drawDino(ctx, worldX, ground, jumpHeight, color, alive, elapsed, airborne, now, view) {
    // 20x21 bitmap at 2.2x = 44x46 px (times the view zoom), feet on the ground line (ground + 2).
    const scale = 2.2 * view.zoom;
    const x = Math.round((worldX - view.offset) * view.zoom);
    ground = ground - jumpHeight * view.zoom;
    const running = alive && this.state === "running" && !airborne;
    const pose = running ? (Math.floor(elapsed * 10) % 2 ? "walkB" : "walkA") : "stand";
    const blink = alive && this.state !== "running" && now % 3600 < 140;
    const sprite = (blink ? SPRITES.dinoBlink : SPRITES.dino)[pose];
    drawSprite(ctx, sprite, x, Math.round(ground + 2 - sprite.height * scale), scale, scale, alive ? color : "#a3aab2", BACKGROUND);
  }
}
