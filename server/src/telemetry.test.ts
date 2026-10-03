import test from 'node:test';
import assert from 'node:assert/strict';
import { _resetTelemetry, affectedTasks, healthOverview, healthTimeline, ingestHeartbeats, listExceptions, resolveException } from './telemetry.js';
import { tasks } from './domain.js';
import type { TaskStatus } from './domain.js';

const originalTasks = tasks.map(task => ({ id: task.id, status: task.status as TaskStatus, equipmentId: task.equipmentId, blockingReasons: [...task.blockingReasons] }));
function resetAll() {
  _resetTelemetry();
  for (const snapshot of originalTasks) {
    const task = tasks.find(item => item.id === snapshot.id);
    if (task) { task.status = snapshot.status; task.equipmentId = snapshot.equipmentId; task.blockingReasons = [...snapshot.blockingReasons]; }
  }
}
const iso = (ms: number) => new Date(ms).toISOString();
const healthOf = (equipmentId: string, now: number) => healthOverview(now).find(item => item.equipmentId === equipmentId);
const taskOf = (id: string) => tasks.find(item => item.id === id);

test('batch ingest is idempotent and classifies duplicates, expired, future and unknown readings', () => {
  resetAll();
  const now = Date.now();
  const batch = {
    batchId: 'B-1',
    readings: [
      { messageId: 'M-1', equipmentId: 'QC-07', recordedAt: iso(now), battery: 90 },
      { messageId: 'M-1', equipmentId: 'QC-07', recordedAt: iso(now), battery: 90 },
      { messageId: 'M-2', equipmentId: 'QC-07', recordedAt: iso(now - 30 * 60_000), battery: 80 },
      { messageId: 'M-3', equipmentId: 'QC-07', recordedAt: iso(now + 10 * 60_000) },
      { messageId: 'M-4', equipmentId: 'NOPE-1', recordedAt: iso(now) }
    ]
  };
  const first = ingestHeartbeats(batch, now);
  assert.deepEqual(
    { accepted: first.accepted, duplicates: first.duplicates, expired: first.expired, future: first.future, unknown: first.unknown },
    { accepted: 1, duplicates: 1, expired: 1, future: 1, unknown: 1 }
  );
  const replayed = ingestHeartbeats(batch, now);
  assert.equal(replayed.duplicate, true);
  assert.equal(replayed.accepted, 1);
  const lateRetry = ingestHeartbeats({ batchId: 'B-2', readings: [{ messageId: 'M-1', equipmentId: 'QC-07', recordedAt: iso(now) }] }, now);
  assert.equal(lateRetry.duplicates, 1);
  assert.equal(lateRetry.accepted, 0);
});

test('stale detection requires fresh heartbeat: delayed report does not recover the device', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-10', readings: [{ messageId: 'M-10', equipmentId: 'QC-07', recordedAt: iso(now), battery: 90 }] }, now);
  assert.equal(healthOf('QC-07', now)?.health, 'healthy');
  const later = now + 120_000;
  assert.equal(healthOf('QC-07', later)?.health, 'stale');
  // 迟到的旧心跳（recordedAt 仍是过去）：被接受补历史，但不能当成恢复
  const delayed = ingestHeartbeats({ batchId: 'B-11', readings: [{ messageId: 'M-11', equipmentId: 'QC-07', recordedAt: iso(now - 30_000), battery: 88 }] }, later);
  assert.equal(delayed.accepted, 1);
  assert.equal(healthOf('QC-07', later + 1_000)?.health, 'stale');
  // 设备重连后重放同批次：幂等返回，状态不变
  const replay = ingestHeartbeats({ batchId: 'B-11', readings: [{ messageId: 'M-11', equipmentId: 'QC-07', recordedAt: iso(now - 30_000) }] }, later);
  assert.equal(replay.duplicate, true);
  assert.equal(healthOf('QC-07', later + 2_000)?.health, 'stale');
  // 真正的新鲜心跳才触发恢复
  ingestHeartbeats({ batchId: 'B-12', readings: [{ messageId: 'M-12', equipmentId: 'QC-07', recordedAt: iso(later), battery: 87 }] }, later);
  assert.equal(healthOf('QC-07', later)?.health, 'healthy');
  const transitions = healthTimeline('QC-07').map(event => `${event.from}->${event.to}`);
  assert.ok(transitions.includes('healthy->stale'));
  assert.ok(transitions.includes('stale->healthy'));
});

test('lost device moves unstarted tasks to pending-reassign and raises exception for executing task', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-20', readings: [{ messageId: 'M-20', equipmentId: 'YC-12', recordedAt: iso(now) }] }, now);
  const later = now + 180_000;
  assert.equal(healthOf('YC-12', later)?.health, 'stale');
  assert.equal(taskOf('TASK-101')?.status, 'pending-reassign');
  assert.equal(taskOf('TASK-102')?.status, 'pending-reassign');
  assert.ok(taskOf('TASK-101')?.blockingReasons.some(reason => reason.includes('待重新指派')));
  // 执行中任务：保持 executing，生成待人工确认异常，绝不静默完成
  ingestHeartbeats({ batchId: 'B-21', readings: [{ messageId: 'M-21', equipmentId: 'TT-31', recordedAt: iso(now) }] }, now);
  assert.equal(healthOf('TT-31', later)?.health, 'stale');
  assert.equal(taskOf('TASK-105')?.status, 'executing');
  const open = listExceptions('open');
  assert.equal(open.length, 1);
  assert.equal(open[0].taskId, 'TASK-105');
  assert.ok(affectedTasks(later).some(task => task.id === 'TASK-105' && task.exception?.id === open[0].id));
});

test('resolving an executing-task exception is manual and idempotent', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-30', readings: [{ messageId: 'M-30', equipmentId: 'TT-31', recordedAt: iso(now) }] }, now);
  const later = now + 180_000;
  healthOverview(later);
  const exception = listExceptions('open')[0];
  assert.equal(exception.taskId, 'TASK-105');
  const resolved = resolveException(exception.id, 'reassign', later);
  assert.equal(resolved?.status, 'resolved');
  assert.equal(taskOf('TASK-105')?.status, 'pending-reassign');
  const again = resolveException(exception.id, 'complete', later);
  assert.equal(again?.resolution, 'reassign');
  assert.equal(taskOf('TASK-105')?.status, 'pending-reassign');
});

test('manual confirm can mark executing task done, but only explicitly', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-40', readings: [{ messageId: 'M-40', equipmentId: 'TT-31', recordedAt: iso(now) }] }, now);
  const later = now + 180_000;
  healthOverview(later);
  assert.equal(taskOf('TASK-105')?.status, 'executing');
  const exception = listExceptions('open')[0];
  resolveException(exception.id, 'complete', later);
  assert.equal(taskOf('TASK-105')?.status, 'done');
});

test('rapid battery drain degrades a device with fresh heartbeats', () => {
  resetAll();
  const now = Date.now();
  const readings = [0, 1, 2, 3, 4].map(minute => ({ messageId: `M-5${minute}`, equipmentId: 'QC-07', recordedAt: iso(now - (4 - minute) * 60_000), battery: 80 - minute * 10 }));
  ingestHeartbeats({ batchId: 'B-50', readings }, now);
  const device = healthOf('QC-07', now);
  assert.equal(device?.health, 'degraded');
  assert.ok(device?.risks.some(risk => risk.code === 'battery-drain'));
});

test('position inconsistent with executing task route is flagged and clears on route', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-60', readings: [{ messageId: 'M-60', equipmentId: 'TT-31', recordedAt: iso(now), position: 'A01-R02' }] }, now);
  const offRoute = healthOf('TT-31', now);
  assert.equal(offRoute?.health, 'degraded');
  assert.ok(offRoute?.risks.some(risk => risk.code === 'off-route'));
  ingestHeartbeats({ batchId: 'B-61', readings: [{ messageId: 'M-61', equipmentId: 'TT-31', recordedAt: iso(now + 5_000), position: 'C03-R06' }] }, now + 5_000);
  const onRoute = healthOf('TT-31', now + 5_000);
  assert.equal(onRoute?.health, 'healthy');
  assert.equal(onRoute?.risks.length, 0);
});

test('out-of-order readings never roll back latest state', () => {
  resetAll();
  const now = Date.now();
  ingestHeartbeats({ batchId: 'B-70', readings: [
    { messageId: 'M-70', equipmentId: 'QC-07', recordedAt: iso(now), battery: 90, position: 'B07' },
    { messageId: 'M-71', equipmentId: 'QC-07', recordedAt: iso(now - 40_000), battery: 55, position: 'A01' }
  ] }, now);
  const device = healthOf('QC-07', now);
  assert.equal(device?.battery, 90);
  assert.equal(device?.lastPosition, 'B07');
});
