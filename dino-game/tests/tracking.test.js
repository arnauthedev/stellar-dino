import test from 'node:test';
import assert from 'node:assert/strict';
import { PoseTracker } from '../src/tracking.js';

function pose({ x = 0.5, rise = 0, squat = false, feet = true } = {}) {
  const points = Array.from({ length: 33 }, () => ({ x, y: .2 - rise, visibility: 1 }));
  for (const [index, px, py] of [
    [11,x-.07,squat?.38:.25],[12,x+.07,squat?.38:.25],
    [23,x-.04,squat?.63:.5],[24,x+.04,squat?.63:.5],
    [25,x-(squat?.14:.04),.7],[26,x+(squat?.14:.04),.7],
    [27,x-.04,.9],[28,x+.04,.9],
  ]) points[index] = { x:px, y:py-rise, visibility: feet || index < 27 ? 1 : .1 };
  return points;
}

function calibrated(mode = 'jump') {
  const jumps = [];
  const tracker = new PoseTracker((id) => jumps.push(id));
  tracker.update([pose()], 0, mode);
  tracker.update([pose()], 400, mode);
  return { tracker, jumps };
}

test('jump is immediate, stays green while airborne, and fires once until landing', () => {
  const {tracker, jumps} = calibrated();
  let [player] = tracker.update([pose({rise:.09})], 450, 'jump');
  assert.equal(player.active, true);
  assert.deepEqual(jumps, ['cam-1']);
  tracker.update([pose({rise:.09})], 900, 'jump');
  assert.equal(jumps.length, 1);
  [player] = tracker.update([pose()], 1000, 'jump');
  assert.equal(player.active, false);
  tracker.update([pose({rise:.09})], 1400, 'jump');
  assert.equal(jumps.length, 2);
});

test('squat requires standing to rearm, without treating a squat as a physical jump', () => {
  const {tracker, jumps} = calibrated('squat');
  let [player] = tracker.update([pose({squat:true})], 500, 'squat');
  assert.equal(player.active, true); assert.equal(jumps.length, 1);
  tracker.update([pose({squat:true})], 1200, 'squat'); assert.equal(jumps.length, 1);
  tracker.update([pose()], 1300, 'squat');
  tracker.update([pose({squat:true})], 1800, 'squat'); assert.equal(jumps.length, 2);
  const jumpTracker = calibrated();
  jumpTracker.tracker.update([pose({squat:true})], 500, 'jump');
  assert.equal(jumpTracker.jumps.length, 0);
});

test('missing feet keep the skeleton neutral and prevent a movement', () => {
  const {tracker, jumps} = calibrated();
  const [player] = tracker.update([pose({rise:.09,feet:false})], 500, 'jump');
  assert.equal(player.active, false); assert.equal(jumps.length, 0);
});

test('player identities survive reversed detector order and brief gaps', () => {
  const tracker = new PoseTracker(() => {});
  tracker.update([pose({x:.25}), pose({x:.75})], 0, 'jump');
  const result = tracker.update([pose({x:.74}), pose({x:.26})], 400, 'jump');
  assert.equal(result.find((p) => p.id === 'cam-1').center.x, .26);
  assert.equal(result.find((p) => p.id === 'cam-2').center.x, .74);
  assert.equal(tracker.update([], 800, 'jump').length, 2);
  assert.equal(tracker.update([], 2000, 'jump').length, 0);
});
