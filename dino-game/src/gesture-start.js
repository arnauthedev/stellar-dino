// PoseTracker emits one movement per jump/squat, rearmed by returning to neutral.
export class GestureStart {
  constructor() { this.squats = new Map(); }
  reset() { this.squats.clear(); }
  retain(ids) { for (const id of this.squats.keys()) if (!ids.includes(id)) this.squats.delete(id); }
  get progress() { return Math.max(0, ...this.squats.values()); }
  movement(id, mode, state) {
    if (state === "running") return "jump";
    if (state === "countdown") return null;
    if (mode === "jump") { this.reset(); return "start"; }
    const count = (this.squats.get(id) || 0) + 1;
    this.squats.set(id, count);
    if (count >= 2) { this.reset(); return "start"; }
    return "progress";
  }
}
