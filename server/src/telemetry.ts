import { auditEvents, equipment, tasks } from './domain.js';
import type { Equipment, YardTask } from './domain.js';

/**
 * 设备遥测接入与健康判定。
 *
 * 接入规则：
 * - 批次幂等：每个批次必须携带 batchId，重复批次直接返回首次处理结果（duplicate=true），不会重复应用。
 * - 消息幂等：每条心跳必须携带全局唯一 messageId（设备重连/重启后重放旧消息会被判重丢弃）。
 * - 乱序到达：以设备时钟 recordedAt 为准，旧读数只进历史，不回退最新状态。
 * - 过期心跳：recordedAt 早于 maxPastMs 的读数直接拒收；晚到但在有效期内的读数只补历史，
 *   不会刷新 lastFreshAt —— 一次延迟上报不会被当成设备恢复，恢复必须靠“新鲜”心跳。
 * - 时钟漂移：recordedAt 超过 maxFutureMs 的未来读数拒收。
 *
 * 健康判定：
 * - offline：设备被置为维护/离线（人工状态，优先于遥测）。
 * - stale：超过 staleAfterMs 没有新鲜心跳（在线但没有新心跳）。
 * - degraded：心跳正常但存在风险（电量快速下降 / 位置与在执行任务路线不一致）。
 * - healthy：无风险。
 *
 * 任务联动（健康变为 stale/offline 时触发，且只触发一次）：
 * - 未开始任务（queued/assigned）→ pending-reassign，等待调度重新指派。
 * - 正在执行的任务 → 生成需人工确认的异常（TaskException），任务保持 executing，绝不静默改成 done。
 */
export const TELEMETRY_RULES = {
  staleAfterMs: 90_000,
  maxPastMs: 10 * 60_000,
  maxFutureMs: 2 * 60_000,
  batteryDropWindowMs: 5 * 60_000,
  batteryDropPerMinute: 2
} as const;

export type HealthStatus = 'healthy' | 'degraded' | 'stale' | 'offline';
export type RiskCode = 'battery-drain' | 'off-route';
export interface TelemetryReadingInput { messageId: string; equipmentId: string; recordedAt: string; battery?: number; position?: string; }
export interface IngestResult { batchId: string; duplicate: boolean; accepted: number; duplicates: number; expired: number; future: number; unknown: number; invalid: number; }
export interface HealthEvent { id: string; equipmentId: string; from: HealthStatus; to: HealthStatus; at: string; reason: string; }
export interface TaskException { id: string; taskId: string; equipmentId: string; reason: string; createdAt: string; status: 'open' | 'resolved'; resolution?: 'resume' | 'reassign' | 'complete'; resolvedAt?: string; }
export interface DeviceRisk { code: RiskCode; detail: string; }

interface BatteryPoint { recordedAt: number; battery: number; }
interface DeviceTelemetry {
  equipmentId: string;
  health: HealthStatus;
  lastRecordedAt: number;
  lastReceivedAt: number;
  lastFreshAt: number;
  battery?: number;
  batteryHistory: BatteryPoint[];
  lastPosition?: string;
  risks: DeviceRisk[];
}

const devices = new Map<string, DeviceTelemetry>();
const healthEvents: HealthEvent[] = [];
const exceptions: TaskException[] = [];
const seenMessageIds = new Set<string>();
const seenBatches = new Map<string, IngestResult>();
let eventSeq = 1;
let exceptionSeq = 1;

function ensureDevice(equipmentId: string): DeviceTelemetry {
  let device = devices.get(equipmentId);
  if (!device) {
    device = { equipmentId, health: 'healthy', lastRecordedAt: 0, lastReceivedAt: 0, lastFreshAt: 0, batteryHistory: [], risks: [] };
    devices.set(equipmentId, device);
  }
  return device;
}

function recordAudit(action: string, entityId: string, details: string, now: number) {
  auditEvents.unshift({ id: `AUD-${now}-${eventSeq}`, actor: '遥测监控', action, entity: 'equipment', entityId, at: new Date(now).toISOString(), details });
}

function applyReading(equipmentId: string, reading: { recordedAt: number; battery?: number; position?: string }, now: number) {
  const device = ensureDevice(equipmentId);
  device.lastReceivedAt = now;
  if (typeof reading.battery === 'number' && Number.isFinite(reading.battery)) {
    device.batteryHistory.push({ recordedAt: reading.recordedAt, battery: reading.battery });
    device.batteryHistory.sort((a, b) => a.recordedAt - b.recordedAt);
    const cutoff = now - TELEMETRY_RULES.batteryDropWindowMs * 2;
    device.batteryHistory = device.batteryHistory.filter(point => point.recordedAt >= cutoff);
  }
  if (reading.recordedAt >= device.lastRecordedAt) {
    device.lastRecordedAt = reading.recordedAt;
    if (typeof reading.battery === 'number' && Number.isFinite(reading.battery)) device.battery = reading.battery;
    if (reading.position) device.lastPosition = reading.position;
  }
  // 只有“到达时仍然新鲜”的读数才算存活证据；迟到的旧心跳不算恢复
  if (reading.recordedAt >= now - TELEMETRY_RULES.staleAfterMs) {
    device.lastFreshAt = Math.max(device.lastFreshAt, reading.recordedAt);
  }
}

export function ingestHeartbeats(payload: { batchId?: string; readings?: TelemetryReadingInput[] }, now = Date.now()): IngestResult {
  if (!payload || typeof payload.batchId !== 'string' || !payload.batchId.trim()) throw new Error('缺少幂等批次键 batchId');
  if (!Array.isArray(payload.readings) || payload.readings.length === 0) throw new Error('心跳批次 readings 不能为空');
  const batchId = payload.batchId.trim();
  const cached = seenBatches.get(batchId);
  if (cached) return { ...cached, duplicate: true };
  const result: IngestResult = { batchId, duplicate: false, accepted: 0, duplicates: 0, expired: 0, future: 0, unknown: 0, invalid: 0 };
  for (const reading of payload.readings) {
    if (!reading || typeof reading.messageId !== 'string' || !reading.messageId.trim() || typeof reading.equipmentId !== 'string' || typeof reading.recordedAt !== 'string') { result.invalid++; continue; }
    const messageId = reading.messageId.trim();
    if (seenMessageIds.has(messageId)) { result.duplicates++; continue; }
    const machine = equipment.find(item => item.id === reading.equipmentId);
    if (!machine) { result.unknown++; continue; }
    const recordedAt = Date.parse(reading.recordedAt);
    if (Number.isNaN(recordedAt)) { result.invalid++; continue; }
    seenMessageIds.add(messageId);
    if (recordedAt < now - TELEMETRY_RULES.maxPastMs) { result.expired++; continue; }
    if (recordedAt > now + TELEMETRY_RULES.maxFutureMs) { result.future++; continue; }
    applyReading(machine.id, { recordedAt, battery: reading.battery, position: reading.position }, now);
    result.accepted++;
  }
  seenBatches.set(batchId, { ...result });
  evaluateAll(now);
  return result;
}

function batteryDrainDetail(device: DeviceTelemetry, now: number): string | undefined {
  const points = device.batteryHistory.filter(point => point.recordedAt >= now - TELEMETRY_RULES.batteryDropWindowMs);
  if (points.length < 2) return undefined;
  const first = points[0];
  const last = points[points.length - 1];
  const minutes = (last.recordedAt - first.recordedAt) / 60_000;
  if (minutes < 1) return undefined;
  const dropPerMinute = (first.battery - last.battery) / minutes;
  if (dropPerMinute < TELEMETRY_RULES.batteryDropPerMinute) return undefined;
  return `电量快速下降：${minutes.toFixed(1)} 分钟内 ${first.battery}% → ${last.battery}%（${dropPerMinute.toFixed(1)}%/min）`;
}

function blockPrefix(value: string) { return value.match(/^([A-Z]\d\d)/)?.[1]; }
function positionMatches(position: string, anchor: string) {
  const positionBlock = blockPrefix(position);
  const anchorBlock = blockPrefix(anchor);
  if (positionBlock && anchorBlock) return positionBlock === anchorBlock;
  return position.includes(anchor) || anchor.includes(position);
}
function offRouteDetail(machine: Equipment, device: DeviceTelemetry): string | undefined {
  if (!device.lastPosition) return undefined;
  const executing = tasks.find(task => task.equipmentId === machine.id && task.status === 'executing');
  if (!executing) return undefined;
  if ([executing.from, executing.to].some(anchor => positionMatches(device.lastPosition!, anchor))) return undefined;
  return `位置 ${device.lastPosition} 与在执行任务 ${executing.id} 路线 ${executing.from} → ${executing.to} 不一致`;
}

function linkTasksToHealth(machine: Equipment, health: 'stale' | 'offline', now: number) {
  const label = health === 'stale' ? '心跳失联' : '维护/离线';
  for (const task of tasks.filter(item => item.equipmentId === machine.id)) {
    if (task.status === 'queued' || task.status === 'assigned') {
      task.status = 'pending-reassign';
      task.blockingReasons = [...task.blockingReasons, `${machine.name} ${label}，任务待重新指派`];
      recordAudit('TASK_PENDING_REASSIGN', machine.id, `${task.id} 因设备${label}转入待重派`, now);
    } else if (task.status === 'executing' && !exceptions.some(item => item.taskId === task.id && item.status === 'open')) {
      exceptions.unshift({ id: `EXC-${exceptionSeq++}`, taskId: task.id, equipmentId: machine.id, reason: `${machine.name} ${label}，任务仍在执行中，需人工确认现场状态`, createdAt: new Date(now).toISOString(), status: 'open' });
      recordAudit('TASK_EXCEPTION', machine.id, `${task.id} 执行中设备${label}，已生成待确认异常`, now);
    }
  }
}

function evaluateDevice(machine: Equipment, device: DeviceTelemetry, now: number) {
  const risks: DeviceRisk[] = [];
  let next: HealthStatus = 'healthy';
  let reason = '心跳恢复新鲜，无活动风险';
  if (machine.status === 'maintenance' || machine.status === 'offline') {
    next = 'offline';
    reason = `设备被置为 ${machine.status}`;
  } else if (now - device.lastFreshAt > TELEMETRY_RULES.staleAfterMs) {
    next = 'stale';
    reason = `超过 ${Math.round(TELEMETRY_RULES.staleAfterMs / 1000)}s 无新鲜心跳`;
  } else {
    const drain = batteryDrainDetail(device, now);
    if (drain) risks.push({ code: 'battery-drain', detail: drain });
    const offRoute = offRouteDetail(machine, device);
    if (offRoute) risks.push({ code: 'off-route', detail: offRoute });
    if (risks.length) { next = 'degraded'; reason = risks.map(risk => risk.detail).join('；'); }
  }
  device.risks = next === 'degraded' ? risks : [];
  if (next !== device.health) {
    healthEvents.unshift({ id: `HEV-${eventSeq}`, equipmentId: machine.id, from: device.health, to: next, at: new Date(now).toISOString(), reason });
    recordAudit('HEALTH_TRANSITION', machine.id, `${device.health} -> ${next}：${reason}`, now);
    eventSeq++;
    device.health = next;
    if (next === 'stale' || next === 'offline') linkTasksToHealth(machine, next, now);
  }
}

export function evaluateAll(now = Date.now()) {
  for (const machine of equipment) {
    const device = devices.get(machine.id);
    if (!device || device.lastReceivedAt === 0) continue;
    evaluateDevice(machine, device, now);
  }
}

export function resolveException(id: string, action: 'resume' | 'reassign' | 'complete', now = Date.now()) {
  const exception = exceptions.find(item => item.id === id);
  if (!exception) return undefined;
  if (exception.status === 'resolved') return exception;
  if (!['resume', 'reassign', 'complete'].includes(action)) throw new Error('未知处置动作，支持 resume / reassign / complete');
  const task = tasks.find(item => item.id === exception.taskId);
  if (!task) throw new Error('关联任务不存在');
  if (action === 'reassign') {
    task.status = 'pending-reassign';
    task.blockingReasons = [...task.blockingReasons, '人工确认：任务转待重派'];
  }
  if (action === 'complete') task.status = 'done';
  exception.status = 'resolved';
  exception.resolution = action;
  exception.resolvedAt = new Date(now).toISOString();
  recordAudit('EXCEPTION_RESOLVE', exception.equipmentId, `${exception.taskId} 人工处置为 ${action}`, now);
  return exception;
}

export function healthOverview(now = Date.now()) {
  evaluateAll(now);
  return equipment.map(machine => {
    const device = devices.get(machine.id);
    const silentForMs = device && device.lastFreshAt > 0 ? Math.max(0, now - device.lastFreshAt) : null;
    return {
      equipmentId: machine.id,
      name: machine.name,
      kind: machine.kind,
      equipmentStatus: machine.status,
      health: device?.health ?? 'healthy',
      risks: device?.risks ?? [],
      battery: device?.battery ?? machine.battery,
      lastHeartbeatAt: device && device.lastFreshAt > 0 ? new Date(device.lastFreshAt).toISOString() : undefined,
      lastPosition: device?.lastPosition,
      silentForMs,
      openExceptions: exceptions.filter(item => item.equipmentId === machine.id && item.status === 'open').length,
      pendingReassign: tasks.filter(item => item.equipmentId === machine.id && item.status === 'pending-reassign').length
    };
  });
}

export function healthTimeline(equipmentId?: string) {
  return healthEvents.filter(event => !equipmentId || event.equipmentId === equipmentId);
}

export function listExceptions(status?: 'open' | 'resolved') {
  return exceptions.filter(item => !status || item.status === status);
}

export function affectedTasks(now = Date.now()): (YardTask & { exception?: TaskException })[] {
  evaluateAll(now);
  return tasks
    .filter(task => task.status === 'pending-reassign' || exceptions.some(item => item.taskId === task.id && item.status === 'open'))
    .map(task => ({ ...task, exception: exceptions.find(item => item.taskId === task.id && item.status === 'open') }));
}

/** 测试专用：清空遥测状态（不动 domain 种子数据）。 */
export function _resetTelemetry() {
  devices.clear();
  healthEvents.length = 0;
  exceptions.length = 0;
  seenMessageIds.clear();
  seenBatches.clear();
}

function seedTelemetry(now = Date.now()) {
  for (const machine of equipment) {
    const device = ensureDevice(machine.id);
    device.lastRecordedAt = now - 15_000;
    device.lastReceivedAt = now - 15_000;
    device.lastFreshAt = now - 15_000;
    device.battery = machine.battery;
    device.lastPosition = machine.location;
    device.batteryHistory = [{ recordedAt: now - 15_000, battery: machine.battery }];
  }
  // TT-31 模拟启动前已失联：上一次新鲜心跳在 staleAfterMs 之外
  const tt31 = ensureDevice('TT-31');
  tt31.lastRecordedAt = now - 150_000;
  tt31.lastReceivedAt = now - 150_000;
  tt31.lastFreshAt = now - 150_000;
}
seedTelemetry();
