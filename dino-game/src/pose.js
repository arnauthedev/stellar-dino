import { PoseTracker, POSE_CONNECTIONS, visible } from "./tracking.js";

export class PoseController {
  constructor(video, overlay, onPlayers, onMovement, onStatus, getMode, onMetrics = () => {}, onFailure = () => {}) {
    Object.assign(this, { video, overlay, onPlayers, onStatus, getMode, onMetrics, onFailure });
    this.tracker = new PoseTracker(onMovement);
    this.ctx = overlay.getContext("2d");
    this.running = false;
    this.generation = 0;
    this.lastRoster = "";
    this.lastStatus = "";
    this.overlayVisible = true;
  }

  status(message) {
    if (message !== this.lastStatus) { this.lastStatus = message; this.onStatus(message); }
  }

  async start() {
    if (this.running) return;
    const generation = ++this.generation;
    this.status("Allow camera access to start tracking.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 60 }, facingMode: "user" } });
    if (generation !== this.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play();
    this.status("Starting body tracking…");
    const worker = new Worker(new URL("./pose-worker.js", import.meta.url), { type: "module" });
    this.worker = worker;
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Body tracking took too long to start. Try again.")), 30000);
        const fail = (error) => { clearTimeout(timeout); reject(error); };
        worker.onerror = (event) => fail(new Error(event.message || "The tracking worker could not start."));
        worker.onmessage = ({ data }) => {
          if (data.type === "ready") { clearTimeout(timeout); this.delegate = data.delegate; resolve(); }
          else if (data.type === "error") fail(new Error(data.message));
        };
        worker.postMessage({ type: "init", origin: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, "") });
      });
    } catch (error) { this.stop(); throw error; }
    if (generation !== this.generation) { worker.terminate(); return; }
    this.running = true;
    this.busy = false;
    this.lastVideoTime = -1;
    this.metricsStart = performance.now();
    this.frames = 0;
    this.totalLatency = 0;
    worker.onmessage = ({ data }) => {
      if (!this.running || generation !== this.generation) return;
      this.busy = false;
      if (data.type === "error") return this.fail(data.message);
      if (data.type !== "result") return;
      const now = performance.now();
      const tracks = this.tracker.update(data.landmarks, data.timestamp, this.getMode(), this.video.videoWidth / this.video.videoHeight);
      this.draw(tracks, data.timestamp);
      const players = tracks.filter((track) => data.timestamp - track.firstSeen >= 200).map(({ id, name }) => ({ id, name }));
      const rosterKey = players.map((player) => player.id).join(",");
      if (rosterKey !== this.lastRoster) { this.lastRoster = rosterKey; this.onPlayers(players); }
      this.status(!tracks.length ? "Step back until your whole body is visible."
        : tracks.some((track) => !track.fullBody) ? "Keep your feet in view to control your Dino."
        : tracks.some((track) => !track.calibrated) ? "Stand tall for a moment to calibrate."
        : `${tracks.length} player${tracks.length === 1 ? "" : "s"} ready. ${this.getMode() === "squat" ? "Squat" : "Jump"} to jump.`);
      this.frames++;
      this.totalLatency += now - data.timestamp;
      if (now - this.metricsStart >= 1000) {
        this.onMetrics({ fps: Math.round(this.frames * 1000 / (now - this.metricsStart)), latency: Math.round(this.totalLatency / this.frames), delegate: data.delegate });
        this.metricsStart = now; this.frames = 0; this.totalLatency = 0;
      }
    };
    worker.onerror = (event) => this.fail(event.message || "Tracking interrupted. Try turning the camera on again.");
    this.status("Stand tall with your whole body in view.");
    this.frame = requestAnimationFrame(() => this.loop(generation));
  }

  loop(generation) {
    if (!this.running || generation !== this.generation) return;
    this.frame = requestAnimationFrame(() => this.loop(generation));
    // One fresh frame in flight. Slow inference drops old frames instead of queuing latency.
    if (this.busy || this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.busy = true;
    this.lastVideoTime = this.video.currentTime;
    const timestamp = performance.now();
    createImageBitmap(this.video).then((bitmap) => {
      if (!this.running || generation !== this.generation) { bitmap.close(); return; }
      this.worker.postMessage({ type: "frame", bitmap, timestamp }, [bitmap]);
    }).catch((error) => { if (generation === this.generation) this.fail(error.message); });
  }

  fail(message) {
    this.stop(); this.status(`Tracking stopped: ${message}`); this.onFailure(message);
  }

  stop() {
    this.running = false; this.generation++;
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.worker?.terminate(); this.worker = null;
    this.video.srcObject = null;
    this.tracker.clear(); this.lastRoster = "";
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    this.onPlayers([]); this.onMetrics(null);
    this.status("Camera off. Space or the Jump button also works.");
  }

  setOverlayVisible(visible) { this.overlayVisible = visible; }

  draw(tracks, time) {
    if (!this.overlayVisible) return;
    const { overlay: canvas, ctx } = this;
    const width = this.video.videoWidth || 640, height = this.video.videoHeight || 480;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const track of tracks) {
      if (time - track.lastSeen > 180) continue;
      const color = track.active ? "#39f879" : "#438dff";
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
      for (const [a, b] of POSE_CONNECTIONS) {
        const p = track.landmarks[a], q = track.landmarks[b];
        if (!visible(p) || !visible(q)) continue;
        ctx.beginPath(); ctx.moveTo(p.x * width, p.y * height); ctx.lineTo(q.x * width, q.y * height); ctx.stroke();
      }
      for (const point of track.landmarks) {
        if (!visible(point)) continue;
        ctx.beginPath(); ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#081422"; ctx.lineWidth = 1; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = 3;
      }

    }
  }
}
