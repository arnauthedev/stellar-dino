// PoseTracker emits one movement per jump/squat, rearmed by returning to neutral.
// A round always starts with two squats (in both modes): standing tall between
// them calibrates where the player's feet and hips are before jumps are measured.
export class GestureStart {
  constructor() { this.squats = new Map(); }
  reset() { this.squats.clear(); }
  retain(ids) { for (const id of this.squats.keys()) if (!ids.includes(id)) this.squats.delete(id); }
  get progress() { return Math.max(0, ...this.squats.values()); }
  movement(id, _mode, state) {
    if (state === "running") return "jump";
    if (state === "countdown") return null;
    const count = (this.squats.get(id) || 0) + 1;
    this.squats.set(id, count);
    if (count >= 2) { this.reset(); return "start"; }
    return "progress";
  }
}
