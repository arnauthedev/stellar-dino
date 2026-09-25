export const POSE_CONNECTIONS = [[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]];
export const visible = (p) => p && (p.visibility ?? 1) > 0.45;
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function kneeAngle(a, b, c, aspect) {
  const u = [(a.x - b.x) * aspect, a.y - b.y];
  const v = [(c.x - b.x) * aspect, c.y - b.y];
  const length = Math.hypot(...u) * Math.hypot(...v);
  return length ? Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / length))) * 180 / Math.PI : 180;
}

export class PoseTracker {
  constructor(onMovement) {
    this.onMovement = onMovement;
    this.tracks = new Map();
    this.nextId = 1;
    this.mode = "jump";
  }

  clear() { this.tracks.clear(); this.nextId = 1; }

  update(poses, time, mode, aspect = 4 / 3) {
    if (mode !== this.mode) {
      this.mode = mode;
      for (const track of this.tracks.values()) { track.latched = false; track.active = false; }
    }
    const detections = poses.filter((points) => [11,12,23,24].every((i) => visible(points[i]))).map((points) => {
      const center = midpoint(points[23], points[24]);
      const fullBody = [25,26,27,28].every((i) => visible(points[i]) && points[i].y < 1 && points[i].y > 0);
      return { points, center, fullBody, hip: center.y, ankle: midpoint(points[27], points[28]).y,
        shoulder: midpoint(points[11], points[12]).y,
        kneeAngle: (kneeAngle(points[23], points[25], points[27], aspect) + kneeAngle(points[24], points[26], points[28], aspect)) / 2 };
    });

    // Assign the closest pairs globally so detector array order never becomes a player ID.
    const pairs = [];
    for (let i = 0; i < detections.length; i++) for (const track of this.tracks.values()) {
      const distance = Math.hypot(track.center.x - detections[i].center.x, track.center.y - detections[i].center.y);
      if (distance < 0.25) pairs.push({ i, track, distance });
    }
    pairs.sort((a, b) => a.distance - b.distance);
    const assigned = new Map(), used = new Set();
    for (const pair of pairs) if (!assigned.has(pair.i) && !used.has(pair.track.id)) { assigned.set(pair.i, pair.track); used.add(pair.track.id); }
    detections.forEach((pose, index) => {
      let track = assigned.get(index);
      if (!track) {
        const number = this.nextId++;
        track = { id: `cam-${number}`, name: `Player ${number}`, firstSeen: time, calibrationStart: null, calibrated: false, baselineHip: pose.hip, baselineAnkle: pose.ankle, latched: false, active: false, lastMove: -Infinity };
        this.tracks.set(track.id, track);
      }
      Object.assign(track, { center: pose.center, landmarks: pose.points, lastSeen: time, fullBody: pose.fullBody });
      this.classify(track, pose, time, mode);
    });
    for (const [id, track] of this.tracks) {
      if (time - track.lastSeen > 180) track.active = false;
      if (time - track.lastSeen > 1400) this.tracks.delete(id);
    }
    return [...this.tracks.values()];
  }

  classify(track, pose, time, mode) {
    track.active = false;
    if (!pose.fullBody) { track.calibrationStart = null; track.latched = false; return; }
    if (!track.calibrated) {
      if (pose.kneeAngle < 145) { track.calibrationStart = null; return; }
      if (track.calibrationStart === null) track.calibrationStart = time;
      track.baselineHip = pose.hip; track.baselineAnkle = pose.ankle;
      track.calibrated = time - track.calibrationStart >= 350;
      return;
    }
    const scale = Math.max(0.2, track.baselineAnkle - pose.shoulder);
    const hipDrop = pose.hip - track.baselineHip;
    const ankleRise = track.baselineAnkle - pose.ankle;
    const hipRise = -hipDrop;
    const reset = mode === "squat"
      ? pose.kneeAngle > 150 && hipDrop < scale * 0.065
      : ankleRise < scale * 0.035 && hipRise < scale * 0.03;
    track.active = mode === "squat"
      ? pose.kneeAngle < 130 && hipDrop > scale * 0.065
      : ankleRise > scale * 0.08 && hipRise > scale * 0.06;
    if (track.active && !track.latched && time - track.lastMove > 350) {
      track.latched = true; track.lastMove = time; this.onMovement(track.id);
    }
    if (reset) track.latched = false;
    if (!track.latched && !track.active && pose.kneeAngle > 150 && Math.abs(hipDrop) < scale * 0.04 && Math.abs(ankleRise) < scale * 0.035) {
      track.baselineHip += (pose.hip - track.baselineHip) * 0.025;
      track.baselineAnkle += (pose.ankle - track.baselineAnkle) * 0.025;
    }
  }
}
