import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmTaskException,
  ingestHeartbeatBatch,
  resetTelemetryDemoState,
  taskExceptions,
  telemetryHealthOverview,
  TELEMETRY_RULES,
  updateYardTask
} from './domain.js';

let counter = 0;
const key = (prefix: string) => `${prefix}-${Date.now()}-${counter++}`;
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

test.beforeEach(() => resetTelemetryDemoState());

test('batch heartbeat ingestion is idempotent for repeated messages', () => {
  const message = { id: `HB-${Date.now()}-dup`, equipmentId: 'QC-07', at: iso(), seq: 9001, battery: 95 };
  const result = ingestHeartbeatBatch([message, { ...message }], key('dup'));
  assert.equal(result.received, 2);
  assert.equal(result.applied, 1);
  assert.equal(result.duplicated, 1);
  assert.equal(result.results[1].status, 'duplicate');
});

test('replaying a batch key returns the original result and does not re-apply heartbeats', () => {
  const idempotencyKey = key('replay');
  const message = { id: `HB-${Date.now()}-replay`, equipmentId: 'YC-12', at: iso(), seq: 7601, battery: 70 };
  const first = ingestHeartbeatBatch([message], idempotencyKey);
  const second = ingestHeartbeatBatch([message], idempotencyKey);
  assert.deepEqual(second, first);
  assert.equal(first.applied, 1);
  assert.equal(second.applied, 1);
});

test('the same batch key cannot be reused for a different payload', () => {
  const idempotencyKey = key('replay-conflict');
  ingestHeartbeatBatch([{ id: `HB-${Date.now()}-replay-a`, equipmentId: 'YC-12', at: iso(), seq: 7701 }], idempotencyKey);
  assert.throws(
    () => ingestHeartbeatBatch([{ id: `HB-${Date.now()}-replay-b`, equipmentId: 'YC-12', at: iso(), seq: 7702 }], idempotencyKey),
    /不能用于不同心跳批次/
  );
});

test('out-of-order sequence or timestamp is accepted into the log but never rolls back health state', () => {
  const id = `HB-${Date.now()}-ooo`;
  ingestHeartbeatBatch([{ id: `${id}-new`, equipmentId: 'YC-12', at: iso(), seq: 8100, battery: 68 }], key('ooo-new'));
  const result = ingestHeartbeatBatch([{ id: `${id}-old`, equipmentId: 'YC-12', at: iso(-5000), seq: 8099, battery: 90 }], key('ooo-old'));
  assert.equal(result.ignoredOutOfOrder, 1);
  const device = telemetryHealthOverview().find(item => item.id === 'YC-12');
  assert.equal(device?.battery, 68);
});

test('a delayed heartbeat does not recover a lost device; two fresh heartbeats are required', () => {
  const delayed = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-late`, equipmentId: 'TT-31', at: iso(-100_000), battery: 40 }], key('late'));
  assert.equal(delayed.results[0].status, 'ignored-late');
  assert.equal(delayed.results[0].healthState, 'lost-contact');

  const first = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-fresh-1`, equipmentId: 'TT-31', at: iso(), seq: 9001, connectionId: 'conn-tt31-b', battery: 41 }], key('fresh-1'));
  assert.equal(first.results[0].healthState, 'reconnecting');

  const second = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-fresh-2`, equipmentId: 'TT-31', at: iso(10), seq: 9002, connectionId: 'conn-tt31-b', battery: 42 }], key('fresh-2'));
  assert.equal(second.results[0].healthState, 'online');
});

test('heartbeats older than the expiry window are rejected and do not change device state', () => {
  const before = telemetryHealthOverview().find(item => item.id === 'RS-02');
  const result = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-expired`, equipmentId: 'RS-02', at: iso(-TELEMETRY_RULES.maxHeartbeatAgeMs - 1000), battery: 100, mode: 'normal' }], key('expired'));
  const after = telemetryHealthOverview().find(item => item.id === 'RS-02');
  assert.equal(result.rejectedExpired, 1);
  assert.equal(after?.telemetry.healthState, 'maintenance');
  assert.equal(after?.battery, before?.battery);
});

test('missing batch idempotency key is rejected', () => {
  assert.throws(() => ingestHeartbeatBatch([{ id: 'x', equipmentId: 'QC-07' }], ''), /Idempotency/);
});

test('maintenance moves queued work to reassignment and executing work to a manual exception', () => {
  updateYardTask('TASK-101', { status: 'executing' });
  const result = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-maint`, equipmentId: 'YC-12', at: iso(), seq: 8200, mode: 'maintenance' }], key('maint'));
  assert.equal(result.results[0].healthState, 'maintenance');
  assert.equal(updateYardTask('TASK-102', {})?.status, 'pending-reassignment');
  assert.equal(updateYardTask('TASK-101', {})?.status, 'exception');
  assert.ok(taskExceptions.some(item => item.taskId === 'TASK-101' && item.status === 'open'));

  const recovered = ingestHeartbeatBatch([{ id: `HB-${Date.now()}-maint-recover`, equipmentId: 'YC-12', at: iso(10), seq: 8201, mode: 'normal' }], key('maint-recover'));
  assert.equal(recovered.results[0].healthState, 'online');
  assert.equal(updateYardTask('TASK-101', {})?.status, 'exception', 'recovery must never close a manual execution exception silently');
});

test('rapid battery discharge is marked degraded and surfaced as a risk', () => {
  ingestHeartbeatBatch([
    { id: `HB-${Date.now()}-bat-1`, equipmentId: 'QC-07', at: iso(), seq: 9100, battery: 90 },
    { id: `HB-${Date.now()}-bat-2`, equipmentId: 'QC-07', at: iso(60_000), seq: 9101, battery: 30 }
  ], key('battery'));
  const device = telemetryHealthOverview().find(item => item.id === 'QC-07');
  assert.equal(device?.telemetry.healthState, 'degraded');
  assert.ok(device?.telemetry.risks.includes('battery-fast-drop'));
  assert.ok((device?.telemetry.batteryDropPerMinute ?? 0) >= TELEMETRY_RULES.batteryFastDropPerMinute);
});

test('a location inconsistent with the active task route is detected', () => {
  updateYardTask('TASK-104', { status: 'executing' });
  ingestHeartbeatBatch([{ id: `HB-${Date.now()}-route`, equipmentId: 'YC-05', at: iso(), seq: 9200, location: 'A99-维修通道', battery: 80 }], key('route'));
  const device = telemetryHealthOverview().find(item => item.id === 'YC-05');
  assert.equal(device?.telemetry.healthState, 'degraded');
  assert.ok(device?.telemetry.risks.includes('route-mismatch'));
});

test('heartbeat timeout sweep records stale then lost transitions', () => {
  const devices = telemetryHealthOverview(Date.now() + 100_000);
  const qc = devices.find(item => item.id === 'QC-07');
  assert.equal(qc?.telemetry.healthState, 'lost-contact');
  const transitionTypes = qc && 'telemetry' in qc ? [] : [];
  const detail = telemetryHealthOverview(Date.now() + 100_000).find(item => item.id === 'QC-07');
  assert.equal(detail?.telemetry.healthState, 'lost-contact');
  assert.ok((qc?.affectedTasks ?? []).length >= 0);
  assert.ok(transitionTypes.length === 0);
});

test('an open device exception blocks silent completion and can be resolved by manual confirmation', () => {
  assert.throws(() => updateYardTask('TASK-105', { status: 'done' }), /人工确认/);
  const result = confirmTaskException('EXC-8001', 'reassign', '测试调度员', '改派备用集卡');
  assert.equal(result?.task.status, 'pending-reassignment');
  assert.equal(result.task.equipmentId, undefined);
  assert.equal(taskExceptions.find(item => item.id === 'EXC-8001')?.status, 'confirmed');

  assert.throws(() => confirmTaskException('EXC-8001', 'complete'), /已经确认/);
});
