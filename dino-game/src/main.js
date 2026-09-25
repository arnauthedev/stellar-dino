import "./style.css";
import QRCode from "qrcode";
import { DinoGame } from "./game.js";
import { PoseController } from "./pose.js";
import { GestureStart } from "./gesture-start.js";
import { GameNet, loadConfig } from "./net.js";

// One global game (no rooms). The laptop (host, /play) shows a QR to /play?g=CODE
// and the live player list; phones scan it, type a name and join.

const icon = (paths) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const cameraIcon = icon('<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>');
const panelIcon = icon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M13 4v16"/>');
const peopleIcon = icon('<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>');
const qrIcon = icon('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>');
const closeIcon = icon('<path d="m6 6 12 12M18 6 6 18"/>');

const params = new URLSearchParams(location.search);
const joinCode = (params.get("g") || "").trim().toUpperCase();
const isHost = !joinCode;

document.querySelector("#app").innerHTML = `
  <main id="workspace" class="workspace">
    <section id="game-panel" class="game-panel" aria-label="Dino game">
      <div class="game-frame"><canvas id="game" tabindex="0" aria-label="Dino game. Space, Up Arrow, or tap to start and jump."></canvas></div>
      <div class="score-overlay" aria-label="Score and best score"><div><span>Score</span><strong id="score">00000</strong></div><div class="best"><span>Best</span><strong id="best">00000</strong></div></div>
      <div id="game-overlay" class="game-overlay"><h1 id="gesture-prompt">Jump to start</h1><div id="squat-progress" class="squat-progress hidden" aria-label="Zero of two squats"><i></i><i></i></div><button id="enable-camera" class="enable-camera">${cameraIcon}<span>Enable camera</span></button></div>
      <p id="tracking-message" class="tracking-message" role="status"></p>
      <div class="dock"><div class="segments" role="group" aria-label="Movement mode"><button id="mode-jump" class="segment active" aria-pressed="true">Jump</button><button id="mode-squat" class="segment" aria-pressed="false">Squat</button></div><button id="camera-toggle" class="icon-button" aria-label="Turn on camera" title="Turn on camera" aria-pressed="false">${cameraIcon}</button><button id="camera-visibility" class="icon-button" aria-label="Hide camera" title="Hide camera" aria-pressed="false">${panelIcon}</button></div>
    </section>
    <section id="camera-panel" class="camera-panel" aria-label="Camera"><video id="camera" autoplay playsinline muted></video><canvas id="pose-overlay" aria-label="Body landmarks"></canvas></section>
  </main>
  <div class="top-controls"><span id="player-count" class="player-count" aria-label="1 player">${peopleIcon}<b id="player-total">1</b></span>${isHost ? `<button id="open-invite" class="icon-button" aria-label="Show join QR and players" title="Invite players" aria-pressed="false">${qrIcon}</button>` : ""}</div>
  ${isHost ? `<aside id="invite" class="invite-panel hidden" aria-label="Join the game"><div class="dialog-header"><h2>Join the game</h2><button id="close-invite" class="icon-button" aria-label="Close">${closeIcon}</button></div><div class="invite"><canvas id="room-qr" role="img" aria-label="QR code to join the game"></canvas><strong id="room-code"></strong></div><p class="room-link">Scan with your phone camera, type your name and play.</p><h3 class="players-heading">Players</h3><ul id="player-list" class="player-list"></ul><p id="room-status" class="room-status" role="status"></p><output id="tracking-speed" class="tracking-speed hidden"></output></aside>` : `<output id="tracking-speed" class="tracking-speed hidden"></output>`}
  ${isHost ? "" : `<div id="join" class="join-screen"><form id="join-form" class="join-card"><h2>Join Dino</h2><p>Type your name to join the game on the big screen.</p><div class="join-form"><input id="name-input" maxlength="16" autocomplete="nickname" placeholder="Your name" required><button class="button primary">Join</button></div><p id="join-status" class="room-status" role="status"></p></form></div>`}
  <div id="toast" class="toast hidden" role="status"></div>
`;

const $ = (id) => document.getElementById(id);
let mode = "jump", cameraActive = false, cameraLoading = false, cameraHidden = false;
let toastTimer, net = null, myName = "", joined = false;
let openingJump = null, previousState = "idle";
const clientId = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
const keyboardPlayer = () => ({ id: "keyboard", name: myName || "You" });
let localPlayers = [keyboardPlayer()];
const gestures = new GestureStart();
const game = new DinoGame($("game"), updateUi);
game.setLocalPlayers(localPlayers);

function text(id, value) { const node = $(id); if (node && node.textContent !== value) node.textContent = value; }
function toast(message) {
  text("toast", message); $("toast").classList.remove("hidden"); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
}
function syncRoundState() {
  if (previousState !== game.state) { gestures.reset(); previousState = game.state; }
}
function updateUi() {
  syncRoundState();
  const locals = game.localState(), total = locals.length + game.remote.length;
  text("score", String(Math.max(0, ...locals.map((p) => p.score))).padStart(5, "0"));
  text("best", String(game.best).padStart(5, "0"));
  text("player-total", String(total));
  $("player-count").setAttribute("aria-label", `${total} player${total === 1 ? "" : "s"}`);
  $("workspace").dataset.state = game.state;
  const running = game.state === "running", countdown = game.state === "countdown";
  $("game-overlay").classList.toggle("hidden", running);
  const verb = game.state === "over" ? "restart" : "start";
  text("gesture-prompt", countdown ? "Ready…" : mode === "jump" ? `Jump to ${verb}` : `Squat twice to ${verb}`);
  $("squat-progress").classList.toggle("hidden", mode !== "squat" || running || countdown || !cameraActive);
  $("squat-progress").setAttribute("aria-label", `${gestures.progress} of two squats`);
  [...$("squat-progress").children].forEach((dot, i) => dot.classList.toggle("done", i < gestures.progress));
  $("enable-camera").classList.toggle("hidden", cameraActive || cameraLoading || running || countdown);
  renderPlayers();
}
/** Phones name their dinos after the player; the laptop keeps "Player N". */
function named(players) {
  if (isHost || !myName) return players;
  return players.map((p, i) => ({ ...p, name: i === 0 ? myName : `${myName} ${i + 1}` }));
}
function setLocalPlayers(players) {
  localPlayers = named(players); game.setLocalPlayers(localPlayers); gestures.retain(localPlayers.map((p) => p.id)); updateUi();
}
function cameraUi(active) {
  $("camera-panel").classList.toggle("live", active);
  $("camera-toggle").setAttribute("aria-pressed", String(active));
  $("camera-toggle").setAttribute("aria-label", active ? "Turn off camera" : "Turn on camera");
  $("camera-toggle").title = active ? "Turn off camera" : "Turn on camera";
  updateUi();
}
function status(message) {
  const short = message.startsWith("Allow") ? "Allow camera access"
    : message.startsWith("Starting") ? "Starting camera…"
    : message.startsWith("Step back") ? "Step back into view"
    : message.startsWith("Keep") ? "Keep your feet in view"
    : message.startsWith("Stand") ? "Stand tall briefly"
    : message.startsWith("Tracking stopped") ? message : "";
  text("tracking-message", short);
}
function blocked() { return !isHost && !joined; }
function movement(id) {
  if (blocked()) return;
  syncRoundState();
  const action = gestures.movement(id, mode, game.state);
  if (action === "start") beginGame(id);
  else if (action === "jump") game.jump(id);
  else if (action === "progress") updateUi();
}
const pose = new PoseController(
  $("camera"), $("pose-overlay"),
  (players) => setLocalPlayers(cameraActive ? players : [keyboardPlayer()]),
  movement, status, () => mode,
  (metrics) => {
    text("tracking-speed", metrics ? `${metrics.fps} fps · ${metrics.latency} ms` : "");
    $("tracking-speed").classList.toggle("hidden", !metrics);
    $("tracking-speed").title = metrics ? `${metrics.delegate} tracking` : "";
    if (metrics) $("tracking-speed").dataset.sampledAt = String(performance.now());
  },
  (message) => { cameraActive = false; cameraUi(false); setLocalPlayers([keyboardPlayer()]); toast(message); },
);

function setMode(next) {
  mode = next; gestures.reset();
  for (const option of ["jump", "squat"]) {
    $(`mode-${option}`).classList.toggle("active", option === next);
    $(`mode-${option}`).setAttribute("aria-pressed", String(option === next));
  }
  updateUi();
}
$("mode-jump").onclick = () => setMode("jump"); $("mode-squat").onclick = () => setMode("squat");
async function toggleCamera() {
  if (cameraLoading) return;
  gestures.reset();
  if (cameraActive) { cameraActive = false; pose.stop(); cameraUi(false); return; }
  cameraLoading = true; cameraActive = true;
  $("camera-toggle").disabled = true; $("enable-camera").disabled = true; setLocalPlayers([]);
  try { await pose.start(); cameraUi(true); }
  catch (error) { cameraActive = false; pose.stop(); cameraUi(false); toast(`Camera unavailable: ${error.message || "permission denied"}`); }
  finally { cameraLoading = false; $("camera-toggle").disabled = false; $("enable-camera").disabled = false; $("game").focus({ preventScroll: true }); updateUi(); }
}
$("camera-toggle").onclick = toggleCamera; $("enable-camera").onclick = toggleCamera;
$("camera-visibility").onclick = () => {
  cameraHidden = !cameraHidden;
  $("workspace").classList.toggle("camera-hidden", cameraHidden);
  $("camera-panel").setAttribute("aria-hidden", String(cameraHidden));
  $("camera-visibility").setAttribute("aria-pressed", String(cameraHidden));
  $("camera-visibility").setAttribute("aria-label", cameraHidden ? "Show camera" : "Hide camera");
  $("camera-visibility").title = cameraHidden ? "Show camera" : "Hide camera";
  pose.setOverlayVisible(!cameraHidden);
};

function beginGame(id = localPlayers[0]?.id) {
  if (!localPlayers.length || blocked()) return;
  gestures.reset();
  const startedAt = Date.now() + 300;
  net?.sendStart(startedAt);
  game.start(startedAt, id);
  $("game").focus({ preventScroll: true });
}
function keyboardMove() {
  if (blocked()) return;
  if (game.state === "idle" || game.state === "over") beginGame();
  else if (game.state === "running") game.jump(localPlayers[0]?.id);
}
$("game").addEventListener("pointerdown", keyboardMove);
document.addEventListener("keydown", (event) => {
  if ((event.code === "Space" || event.code === "ArrowUp") && !["INPUT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)) {
    event.preventDefault(); if (!event.repeat) keyboardMove();
  }
});

/* ---------- global game ---------- */

let presence = [];
function renderPlayers() {
  const list = $("player-list");
  if (!list) return;
  const rows = [
    ...game.localState().map((p) => ({ name: p.name, score: p.score, alive: p.alive, here: true })),
    ...game.remote.map((p) => ({ name: p.name, score: p.score, alive: p.alive })),
  ];
  const waiting = presence.filter((p) => p.role === "player" && !game.remote.some((r) => r.id.startsWith(`${p.id}:`)));
  const html = rows.map((r) => `<li><i class="${r.alive ? "alive" : ""}"></i><span>${escapeHtml(r.name)}${r.here ? " <em>(laptop)</em>" : ""}</span><b>${String(r.score || 0).padStart(5, "0")}</b></li>`)
    .concat(waiting.map((p) => `<li class="waiting"><i></i><span>${escapeHtml(p.name)} <em>joining…</em></span><b></b></li>`)).join("");
  if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

async function showQr(code) {
  const link = `${location.origin}/play?g=${code}`;
  text("room-code", `${code.slice(0, 3)} ${code.slice(3)}`);
  try { await QRCode.toCanvas($("room-qr"), link, { width: 224, margin: 2, errorCorrectionLevel: "M", color: { dark: "#242b34", light: "#ffffff" } }); }
  catch { text("room-status", "QR unavailable."); }
}

async function connect(config) {
  net = new GameNet(config, {
    clientId, name: isHost ? "Laptop" : myName, role: isHost ? "host" : "player",
    onRoster: (players) => { game.setRemotePlayers(players); updateUi(); },
    onStart: (startedAt) => { gestures.reset(); game.start(startedAt, openingJump); openingJump = null; $("game").focus({ preventScroll: true }); },
    onPresence: (list) => { presence = list; updateUi(); },
    onReset: async (code) => {
      game.setRemotePlayers([]);
      if (isHost) { await net.setCode(code); await showQr(code); toast("Game reset. New join code."); }
      else { joined = false; await net.leave(); net = null; showJoinMessage("The game was reset. Scan the new QR code on the big screen."); }
      updateUi();
    },
  });
  await net.subscribe();
}

function showJoinMessage(message) {
  $("join").classList.remove("hidden");
  $("join-form").innerHTML = `<h2>Dino</h2><p>${escapeHtml(message)}</p>`;
}

if (isHost) {
  const toggleInvite = (open) => {
    $("invite").classList.toggle("hidden", !open);
    $("open-invite").setAttribute("aria-pressed", String(open));
  };
  $("open-invite").onclick = () => toggleInvite($("invite").classList.contains("hidden"));
  $("close-invite").onclick = () => toggleInvite(false);
  loadConfig()
    .then(async (config) => { await showQr(config.code); await connect(config); toggleInvite(true); })
    .catch((error) => toast(error.status === 401 ? "Open this game from the app's Play page." : error.message));
} else {
  $("join-form").onsubmit = async (event) => {
    event.preventDefault();
    const name = $("name-input").value.trim().slice(0, 16);
    if (!name) return;
    text("join-status", "Joining…");
    try {
      const config = await loadConfig(joinCode);
      myName = name;
      await connect(config);
      joined = true;
      $("join").classList.add("hidden");
      setLocalPlayers(cameraActive ? localPlayers : [keyboardPlayer()]);
      toast(`Welcome, ${name}! Enable the camera, then jump to start.`);
    } catch (error) {
      text("join-status", error.status === 404 ? "This game code is no longer valid. Scan the QR code on the big screen again." : error.message);
    }
  };
  $("name-input").focus();
}

setInterval(() => { if (net && (isHost || joined)) net.sendState(game.localState()); }, 180);
window.addEventListener("pagehide", () => { pose.stop(); net?.leave(); });
updateUi();
