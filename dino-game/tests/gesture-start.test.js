import test from 'node:test';
import assert from 'node:assert/strict';
import { GestureStart } from '../src/gesture-start.js';
import { PoseTracker } from '../src/tracking.js';

function pose(squat = false, rise = 0) {
  const points = Array.from({ length:33 }, () => ({ x:.5,y:.2-rise,visibility:1 }));
  for (const [i,x,y] of [[11,.43,squat?.38:.25],[12,.57,squat?.38:.25],[23,.46,squat?.63:.5],[24,.54,squat?.63:.5],[25,squat?.36:.46,.7],[26,squat?.64:.54,.7],[27,.46,.9],[28,.54,.9]]) points[i]={x,y:y-rise,visibility:1};
  return points;
}

test('the first physical jump starts, then subsequent jumps control the running game', () => {
  const gate = new GestureStart(), actions=[];
  let state='idle';
  const tracker=new PoseTracker((id)=>{ const action=gate.movement(id,'jump',state);actions.push(action);if(action==='start')state='running'; });
  tracker.update([pose()],0,'jump'); tracker.update([pose()],400,'jump');
  tracker.update([pose(false,.09)],500,'jump');
  assert.deepEqual(actions,['start']);
  tracker.update([pose()],700,'jump'); tracker.update([pose(false,.09)],1000,'jump');
  assert.deepEqual(actions,['start','jump']);
});

test('a held squat counts once; standing and squatting again starts the round', () => {
  const gate=new GestureStart(), actions=[];
  const tracker=new PoseTracker((id)=>actions.push(gate.movement(id,'squat','idle')));
  tracker.update([pose()],0,'squat'); tracker.update([pose()],400,'squat');
  for(const t of [500,700,900,1200])tracker.update([pose(true)],t,'squat');
  assert.deepEqual(actions,['progress']); assert.equal(gate.progress,1);
  tracker.update([pose()],1500,'squat'); tracker.update([pose(true)],1900,'squat');
  assert.deepEqual(actions,['progress','start']); assert.equal(gate.progress,0);
});

test('two players each doing one squat cannot combine to start a round', () => {
  const gate=new GestureStart();
  assert.equal(gate.movement('one','squat','idle'),'progress');
  assert.equal(gate.movement('two','squat','idle'),'progress');
  assert.equal(gate.progress,1);
  assert.equal(gate.movement('one','squat','idle'),'start');
});

test('pending rounds ignore movements and resets clear incomplete starts', () => {
  const gate=new GestureStart();
  gate.movement('one','squat','idle'); gate.reset();
  assert.equal(gate.movement('one','squat','over'),'progress');
  assert.equal(gate.movement('one','squat','countdown'),null);
  gate.retain([]); assert.equal(gate.progress,0);
});
