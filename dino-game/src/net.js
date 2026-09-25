// One global game over a single Supabase Realtime channel (replaces the room server).
// - presence: who is connected (name, role)
// - broadcast "state": each client's players (score, alive, jump height) ~5x/s
// - broadcast "start": synchronized round start (anyone can start)
// - broadcast "reset": sent by the app's control panel; new join code, everyone out
import { createClient } from "@supabase/supabase-js";

const CHANNEL = "dino-game";

export async function loadConfig(joinCode) {
  const url = joinCode ? `/api/game/join?g=${encodeURIComponent(joinCode)}` : "/api/game/host";
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Could not load the game."), { status: res.status });
  return data; // { code, supabaseUrl, supabaseKey }
}

export class GameNet {
  constructor(config, { clientId, name, role, onRoster, onStart, onReset, onPresence }) {
    this.code = config.code;
    this.clientId = clientId;
    this.name = name;
    this.role = role;
    this.roster = new Map(); // clientId -> { players, at }
    this.handlers = { onRoster, onStart, onReset, onPresence };
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
    this.channel = this.supabase.channel(CHANNEL, {
      config: { presence: { key: clientId }, broadcast: { self: false } },
    });
    this.channel
      .on("broadcast", { event: "state" }, ({ payload }) => {
        if (payload.code !== this.code || payload.clientId === clientId) return;
        this.roster.set(payload.clientId, { name: payload.name, players: payload.players, at: Date.now() });
        this.emitRoster();
      })
      .on("broadcast", { event: "start" }, ({ payload }) => {
        if (payload.code === this.code) onStart(payload.startedAt);
      })
      .on("broadcast", { event: "reset" }, ({ payload }) => onReset(payload.code))
      .on("presence", { event: "sync" }, () => onPresence(this.presence()));
    this.pruneTimer = setInterval(() => this.prune(), 1000);
  }

  subscribe() {
    return new Promise((resolve, reject) => {
      this.channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.channel.track({ name: this.name, role: this.role, code: this.code });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error("Could not connect to the game."));
      });
    });
  }

  presence() {
    const state = this.channel.presenceState();
    return Object.entries(state)
      .map(([id, metas]) => ({ id, ...metas[0] }))
      .filter((p) => p.code === this.code);
  }

  sendState(players) {
    this.channel.send({ type: "broadcast", event: "state", payload: { code: this.code, clientId: this.clientId, name: this.name, players } });
  }

  sendStart(startedAt) {
    this.channel.send({ type: "broadcast", event: "start", payload: { code: this.code, startedAt } });
  }

  async setCode(code) {
    this.code = code;
    this.roster.clear();
    this.emitRoster();
    await this.channel.track({ name: this.name, role: this.role, code });
  }

  prune() {
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of this.roster) if (now - entry.at > 3000) { this.roster.delete(id); changed = true; }
    if (changed) this.emitRoster();
  }

  emitRoster() {
    const players = [...this.roster.entries()].flatMap(([id, entry]) =>
      (entry.players || []).slice(0, 4).map((p) => ({
        id: `${id}:${String(p.id).slice(0, 30)}`,
        name: String(p.name || entry.name || "Player").slice(0, 24),
        score: Math.max(0, Math.min(999999, Math.floor(Number(p.score) || 0))),
        alive: Boolean(p.alive),
        jump: Math.max(0, Math.min(1, Number(p.jump) || 0)),
      })),
    );
    this.handlers.onRoster(players);
  }

  async leave() {
    clearInterval(this.pruneTimer);
    await this.channel.untrack().catch(() => undefined);
    await this.supabase.removeChannel(this.channel);
  }
}
