export type ContainerStatus = 'in-transit' | 'at-gate' | 'in-yard' | 'on-quay' | 'released' | 'hold';
export type EquipmentKind = 'quay-crane' | 'yard-crane' | 'terminal-truck' | 'reach-stacker';
export type TaskStatus = 'queued' | 'assigned' | 'executing' | 'blocked' | 'pending-reassignment' | 'exception' | 'done';
export type TelemetryMode = 'normal' | 'maintenance';
export type DeviceHealthState = 'online' | 'reconnecting' | 'stale' | 'degraded' | 'maintenance' | 'lost-contact';
export type DeviceRiskKind = 'heartbeat-stale' | 'heartbeat-lost' | 'battery-fast-drop' | 'route-mismatch' | 'reconnect-pending';
export type ConfirmationAction = 'continue' | 'reassign' | 'complete';
export type AppointmentStatus = 'booked' | 'checked-in' | 'completed' | 'cancelled' | 'exception';

export interface Voyage { id: string; vessel: string; imo: string; service: string; eta: string; etd: string; status: 'approaching' | 'berthed' | 'loading' | 'departed'; berth: string; movesPlanned: number; movesDone: number; lateRisk: 'low' | 'medium' | 'high'; }
export interface Container { id: string; voyageId: string; size: '20' | '40' | '45'; isoType: string; direction: 'import' | 'export' | 'transshipment'; status: ContainerStatus; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released' | 'inspection' | 'hold'; priority: 'normal' | 'hot' | 'reefer' | 'hazmat'; yardSlot: string; appointmentId?: string; lastEvent: string; }
export interface YardBlock { id: string; zone: string; rows: number; tiers: number; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; equipment: EquipmentKind[]; heat: number; }
export interface GateAppointment { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup' | 'dropoff'; windowStart: string; windowEnd: string; lane: 'north' | 'south' | 'rail'; status: AppointmentStatus; sealVerified: boolean; weightVerified: boolean; exception?: string; }
export interface Equipment { id: string; name: string; kind: EquipmentKind; status: 'available' | 'working' | 'maintenance' | 'offline'; location: string; battery: number; queue: number; movesPerHour: number; healthState?: DeviceHealthState; lastHeartbeatAt?: string; lastAcceptedAt?: string; healthRisks?: DeviceRiskKind[]; }
export interface YardTask { id: string; kind: 'receive' | 'deliver' | 'rehandle' | 'load' | 'discharge' | 'inspect'; containerId: string; from: string; to: string; equipmentId?: string; priority: number; status: TaskStatus; scheduledAt: string; blockingReasons: string[]; estimatedMinutes: number; }
export interface TelemetryHeartbeatInput {
  id: string;
  equipmentId: string;
  at?: string;
  seq?: number;
  location?: string;
  battery?: number;
  mode?: TelemetryMode;
  connectionId?: string;
  routeStatus?: 'on-route' | 'off-route' | 'unknown';
}
export interface TelemetryTimelineEvent {
  id: string;
  equipmentId: string;
  at: string;
  type: 'health-transition' | 'risk-raised' | 'risk-cleared' | 'reconnect' | 'heartbeat-ignored' | 'task-impact';
  fromState?: DeviceHealthState;
  toState?: DeviceHealthState;
  risk?: DeviceRiskKind;
  reason: string;
  heartbeatId?: string;
  taskId?: string;
}
export interface TaskException {
  id: string;
  taskId: string;
  equipmentId: string;
  kind: 'device-lost-contact' | 'device-maintenance';
  reason: string;
  status: 'open' | 'confirmed';
  createdAt: string;
  confirmedAt?: string;
  confirmedBy?: string;
  action?: ConfirmationAction;
  resolution?: string;
}
export interface TelemetryDeviceState {
  equipmentId: string;
  healthState: DeviceHealthState;
  lastSeq: number;
  lastFreshSeq: number;
  latestHeartbeatAt: number;
  lastAcceptedAt: number;
  lastLocation?: string;
  lastBattery?: number;
  batteryDropPerMinute?: number;
  mode: TelemetryMode;
  connectionId?: string;
  risks: DeviceRiskKind[];
  timeline: TelemetryTimelineEvent[];
}
export interface HeartbeatResultItem {
  id: string;
  equipmentId?: string;
  status: 'applied' | 'duplicate' | 'ignored-out-of-order' | 'ignored-late' | 'rejected-expired' | 'rejected';
  healthState?: DeviceHealthState;
  reason?: string;
}
export interface AuditEvent { id: string; actor: string; action: string; entity: string; entityId: string; at: string; details: string; }

const start = Date.now(); const iso = (minutes: number) => new Date(start + minutes * 60000).toISOString();
export const voyages: Voyage[] = [
  { id: 'VOY-AX7', vessel: 'MSC Aurora', imo: 'IMO9382014', service: 'AE-3', eta: iso(-90), etd: iso(350), status: 'berthed', berth: 'B07', movesPlanned: 1240, movesDone: 886, lateRisk: 'medium' },
  { id: 'VOY-QF2', vessel: 'Ever Quartz', imo: 'IMO9721103', service: 'TP9', eta: iso(190), etd: iso(890), status: 'approaching', berth: 'B04', movesPlanned: 760, movesDone: 0, lateRisk: 'high' },
  { id: 'VOY-RD8', vessel: 'ONE Redwood', imo: 'IMO9812340', service: 'PNW', eta: iso(-700), etd: iso(-330), status: 'departed', berth: 'B02', movesPlanned: 520, movesDone: 520, lateRisk: 'low' }
];
export const blocks: YardBlock[] = [
  { id: 'A01', zone: 'North Import', rows: 14, tiers: 5, capacity: 280, occupied: 247, reeferPlugs: 18, usedPlugs: 16, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 78 },
  { id: 'B07', zone: 'Central Transshipment', rows: 18, tiers: 5, capacity: 360, occupied: 302, reeferPlugs: 24, usedPlugs: 19, hazmatAllowed: true, equipment: ['yard-crane', 'reach-stacker', 'terminal-truck'], heat: 91 },
  { id: 'C03', zone: 'Export Pre-staging', rows: 12, tiers: 4, capacity: 192, occupied: 128, reeferPlugs: 8, usedPlugs: 3, hazmatAllowed: false, equipment: ['yard-crane', 'terminal-truck'], heat: 54 },
  { id: 'D05', zone: 'Inspection & Hold', rows: 8, tiers: 3, capacity: 96, occupied: 72, reeferPlugs: 5, usedPlugs: 4, hazmatAllowed: true, equipment: ['reach-stacker'], heat: 63 }
];
export const containers: Container[] = [
  { id: 'MSCU-4829017', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: 22.4, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'A01-R07-T3', lastEvent: '卸船完成 08:42' },
  { id: 'EISU-1288420', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 27.8, reefer: true, temperature: -18, customs: 'released', priority: 'reefer', yardSlot: 'B07-R03-T2', lastEvent: '温度回传正常 08:51' },
  { id: 'TGHU-9831204', voyageId: 'VOY-AX7', size: '20', isoType: '22K2', direction: 'transshipment', status: 'hold', weightT: 19.7, reefer: false, hazmatClass: '3', customs: 'inspection', priority: 'hazmat', yardSlot: 'D05-R02-T1', lastEvent: '海关查验挂起' },
  { id: 'OOLU-7734201', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'export', status: 'at-gate', weightT: 24.1, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R06-T1', appointmentId: 'APT-9001', lastEvent: '南闸口已称重' },
  { id: 'CMAU-6001722', voyageId: 'VOY-QF2', size: '40', isoType: '45G1', direction: 'import', status: 'in-transit', weightT: 23.5, reefer: false, customs: 'released', priority: 'hot', yardSlot: 'B07-R10-T1', lastEvent: '船期 ETA +35min' },
  { id: 'FCIU-9920310', voyageId: 'VOY-QF2', size: '20', isoType: '22G1', direction: 'export', status: 'in-yard', weightT: 12.2, reefer: false, customs: 'released', priority: 'normal', yardSlot: 'C03-R04-T2', lastEvent: '待装船' },
  { id: 'TEMU-1774029', voyageId: 'VOY-AX7', size: '40', isoType: '45R1', direction: 'import', status: 'in-yard', weightT: 26.3, reefer: true, temperature: 4, customs: 'inspection', priority: 'reefer', yardSlot: 'D05-R05-T1', lastEvent: '待海关查验' }
];
export const appointments: GateAppointment[] = [
  { id: 'APT-9001', containerId: 'OOLU-7734201', truckNo: '沪A·7K229', driver: '陈海', type: 'dropoff', windowStart: iso(-14), windowEnd: iso(16), lane: 'south', status: 'checked-in', sealVerified: true, weightVerified: true },
  { id: 'APT-9002', containerId: 'MSCU-4829017', truckNo: '苏E·66218', driver: '王建国', type: 'pickup', windowStart: iso(34), windowEnd: iso(64), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9003', containerId: 'EISU-1288420', truckNo: '沪B·02891', driver: '赵晨', type: 'pickup', windowStart: iso(38), windowEnd: iso(68), lane: 'north', status: 'booked', sealVerified: false, weightVerified: false },
  { id: 'APT-9004', containerId: 'FCIU-9920310', truckNo: '沪A·7K229', driver: '陈海', type: 'pickup', windowStart: iso(4), windowEnd: iso(22), lane: 'south', status: 'booked', sealVerified: false, weightVerified: false, exception: '同一车辆相邻窗口过短' }
];
export const equipment: Equipment[] = [
  { id: 'QC-07', name: '岸桥 QC-07', kind: 'quay-crane', status: 'working', location: 'B07 / MSC Aurora', battery: 96, queue: 4, movesPerHour: 31 },
  { id: 'YC-12', name: '场桥 YC-12', kind: 'yard-crane', status: 'working', location: 'B07-R03', battery: 72, queue: 9, movesPerHour: 24 },
  { id: 'YC-05', name: '场桥 YC-05', kind: 'yard-crane', status: 'available', location: 'C03-R06', battery: 88, queue: 3, movesPerHour: 27 },
  { id: 'TT-31', name: '集卡 TT-31', kind: 'terminal-truck', status: 'working', location: '南闸口', battery: 61, queue: 2, movesPerHour: 8 },
  { id: 'RS-02', name: '正面吊 RS-02', kind: 'reach-stacker', status: 'maintenance', location: 'D05', battery: 34, queue: 0, movesPerHour: 14 }
];
export const tasks: YardTask[] = [
  { id: 'TASK-101', kind: 'deliver', containerId: 'MSCU-4829017', from: 'A01-R07-T3', to: '南闸口', equipmentId: 'YC-12', priority: 92, status: 'assigned', scheduledAt: iso(12), blockingReasons: [], estimatedMinutes: 18 },
  { id: 'TASK-102', kind: 'rehandle', containerId: 'EISU-1288420', from: 'B07-R03-T2', to: 'D05-R05-T1', equipmentId: 'YC-12', priority: 88, status: 'queued', scheduledAt: iso(24), blockingReasons: ['查验区插件余量接近阈值'], estimatedMinutes: 26 },
  { id: 'TASK-103', kind: 'inspect', containerId: 'TGHU-9831204', from: 'D05-R02-T1', to: 'D05-R02-T1', priority: 125, status: 'blocked', scheduledAt: iso(4), blockingReasons: ['RS-02 维护中', '待海关查验窗口'], estimatedMinutes: 32 },
  { id: 'TASK-104', kind: 'load', containerId: 'FCIU-9920310', from: 'C03-R04-T2', to: 'B07 / VOY-QF2', equipmentId: 'YC-05', priority: 75, status: 'queued', scheduledAt: iso(76), blockingReasons: [], estimatedMinutes: 21 },
  { id: 'TASK-105', kind: 'deliver', containerId: 'OOLU-7734201', from: '南闸口', to: 'C03-R06-T1', equipmentId: 'TT-31', priority: 84, status: 'exception', scheduledAt: iso(2), blockingReasons: ['TT-31 心跳失联，执行中任务需要人工确认'], estimatedMinutes: 16 },
  { id: 'TASK-106', kind: 'rehandle', containerId: 'TEMU-1774029', from: 'D05-R05-T1', to: 'D05-R02-T1', equipmentId: 'RS-02', priority: 79, status: 'pending-reassignment', scheduledAt: iso(18), blockingReasons: ['RS-02 维护中，任务进入待重派'], estimatedMinutes: 24 }
];
export const auditEvents: AuditEvent[] = [{ id: 'AUD-500', actor: '中控调度员', action: 'REPLAN', entity: 'voyage', entityId: 'VOY-AX7', at: new Date(start - 20 * 60000).toISOString(), details: '因 QC-07 瞬时降速，重新计算 14 个高优先级作业' }];

export const TELEMETRY_RULES = {
  expectedHeartbeatMs: 30_000,
  staleHeartbeatMs: 45_000,
  lostHeartbeatMs: 90_000,
  maxFutureClockSkewMs: 60_000,
  maxHeartbeatAgeMs: 120_000,
  batteryFastDropPerMinute: 15,
  recoveryFreshChecks: 2,
  idempotencyTtlMs: 24 * 60 * 60_000,
  note: '乱序消息按序列号和事件时间丢弃；重复消息按消息 ID 幂等；失联设备必须连续两次新鲜心跳才恢复，延迟上报不会恢复。'
} as const;

export class TelemetryValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'TelemetryValidationError'; }
}

export const taskExceptions: TaskException[] = [];
const telemetryStates = new Map<string, TelemetryDeviceState>();
const processedHeartbeats = new Map<string, { equipmentId: string; status: HeartbeatResultItem['status']; at: number; result: HeartbeatResultItem }>();
const idempotentTelemetryBatches = new Map<string, { at: number; requestKey: string; response: { received: number; applied: number; duplicated: number; ignoredOutOfOrder: number; ignoredLate: number; rejectedExpired: number; rejected: number; results: HeartbeatResultItem[] } }>();
let telemetrySequence = 0;
const initialEquipmentSnapshot = JSON.parse(JSON.stringify(equipment)) as Equipment[];
const initialTasksSnapshot = JSON.parse(JSON.stringify(tasks)) as YardTask[];
const initialExceptionsSnapshot = JSON.parse(JSON.stringify(taskExceptions)) as TaskException[];

const telemetryNow = () => Date.now();
const toIso = (value: number) => new Date(value).toISOString();
function nextTelemetryId(prefix: string) { telemetrySequence += 1; return `${prefix}-${Date.now().toString(36).toUpperCase()}-${telemetrySequence}`; }
function findEquipmentOrThrow(equipmentId: string) {
  const item = equipment.find(machine => machine.id === equipmentId);
  if (!item) throw new TelemetryValidationError(`设备 ${equipmentId} 不存在`);
  return item;
}
function addTimelineEvent(state: TelemetryDeviceState, event: Omit<TelemetryTimelineEvent, 'id' | 'equipmentId'>) {
  state.timeline.unshift({ ...event, id: nextTelemetryId('TEV'), equipmentId: state.equipmentId });
  state.timeline = state.timeline.slice(0, 200);
}
function normalizeLocation(value?: string) { return (value ?? '').trim().toUpperCase(); }
function routeTokens(value: string) {
  return normalizeLocation(value).split(/[\s/\\→-]+/).filter(token => token.length >= 2);
}
function locationMatchesRoute(location: string, endpoint: string) {
  const actual = normalizeLocation(location);
  if (!actual) return false;
  const target = normalizeLocation(endpoint);
  return actual === target || target.includes(actual) || actual.includes(target) || routeTokens(endpoint).some(token => actual.includes(token));
}
function activeRouteTask(equipmentId: string) {
  return tasks.find(task => task.equipmentId === equipmentId && (task.status === 'assigned' || task.status === 'executing'));
}
function calculateBatteryRisk(state: TelemetryDeviceState, nextBattery: number | undefined, eventAt: number): { risks: DeviceRiskKind[]; dropRate?: number } {
  if (nextBattery === undefined) return { risks: state.risks.filter(risk => risk !== 'battery-fast-drop'), dropRate: state.batteryDropPerMinute };
  if (state.lastBattery !== undefined && eventAt > state.latestHeartbeatAt && nextBattery < state.lastBattery) {
    const minutes = Math.max((eventAt - state.latestHeartbeatAt) / 60000, 1 / 60);
    const dropRate = (state.lastBattery - nextBattery) / minutes;
    if (dropRate >= TELEMETRY_RULES.batteryFastDropPerMinute) return { risks: [...new Set<DeviceRiskKind>([...state.risks.filter(risk => risk !== 'battery-fast-drop'), 'battery-fast-drop'])], dropRate };
    return { risks: state.risks.filter(risk => risk !== 'battery-fast-drop'), dropRate };
  }
  return { risks: state.risks.filter(risk => risk !== 'battery-fast-drop'), dropRate: undefined };
}
function calculateRouteRisk(equipmentId: string, location: string | undefined, current: DeviceRiskKind[]): DeviceRiskKind[] {
  const withoutRoute = current.filter(risk => risk !== 'route-mismatch');
  const task = activeRouteTask(equipmentId);
  if (!task || task.status !== 'executing' || !location) return withoutRoute;
  const matched = locationMatchesRoute(location, task.from) || locationMatchesRoute(location, task.to);
  return matched ? withoutRoute : [...withoutRoute, 'route-mismatch'];
}
function baseRisksForAge(state: DeviceHealthState, ageMs: number, risks: DeviceRiskKind[]) {
  const next = new Set<DeviceRiskKind>(risks.filter(risk => risk !== 'heartbeat-stale' && risk !== 'heartbeat-lost' && risk !== 'reconnect-pending'));
  if (state === 'lost-contact') next.add('heartbeat-lost');
  else if (state === 'reconnecting') next.add('reconnect-pending');
  else if (ageMs >= TELEMETRY_RULES.staleHeartbeatMs && ageMs < TELEMETRY_RULES.lostHeartbeatMs) next.add('heartbeat-stale');
  return [...next];
}
function targetHealthState(mode: TelemetryMode, state: DeviceHealthState, ageMs: number, risks: DeviceRiskKind[]): DeviceHealthState {
  if (mode === 'maintenance') return 'maintenance';
  if (state === 'lost-contact') return 'lost-contact';
  if (state === 'reconnecting') return 'reconnecting';
  if (ageMs >= TELEMETRY_RULES.lostHeartbeatMs) return 'lost-contact';
  if (ageMs >= TELEMETRY_RULES.staleHeartbeatMs) return 'stale';
  if (risks.includes('battery-fast-drop') || risks.includes('route-mismatch')) return 'degraded';
  return 'online';
}
function syncEquipment(state: TelemetryDeviceState) {
  const machine = equipment.find(item => item.id === state.equipmentId);
  if (!machine) return;
  machine.healthState = state.healthState;
  machine.lastHeartbeatAt = toIso(state.latestHeartbeatAt);
  machine.lastAcceptedAt = toIso(state.lastAcceptedAt);
  machine.healthRisks = state.risks;
  if (state.lastLocation) machine.location = state.lastLocation;
  if (state.lastBattery !== undefined) machine.battery = state.lastBattery;
  if (state.healthState === 'maintenance') machine.status = 'maintenance';
  else if (state.healthState === 'lost-contact') machine.status = 'offline';
  else if (state.healthState === 'online' || state.healthState === 'degraded') machine.status = tasks.some(task => task.equipmentId === machine.id && task.status === 'executing') ? 'working' : 'available';
}
function affectTasksForUnhealthyEquipment(equipmentId: string, health: 'maintenance' | 'lost-contact', at: string) {
  const machine = equipment.find(item => item.id === equipmentId);
  const reason = health === 'maintenance' ? `${equipmentId} 进入维护，任务需要调度处理` : `${equipmentId} 心跳超过失联阈值，任务需要调度处理`;
  for (const task of tasks.filter(item => item.equipmentId === equipmentId)) {
    if (task.status === 'queued' || task.status === 'assigned' || task.status === 'blocked') {
      task.status = 'pending-reassignment';
      if (!task.blockingReasons.includes(reason)) task.blockingReasons.push(reason);
      addTimelineEvent(telemetryStates.get(equipmentId)!, { at, type: 'task-impact', reason: `未开始任务 ${task.id} 进入待重派`, taskId: task.id });
    } else if (task.status === 'executing') {
      task.status = 'exception';
      const detail = health === 'maintenance' ? '设备维护：执行中任务已暂停，必须由调度员确认后续动作' : '设备失联：执行中任务不能自动完成，必须由调度员确认后续动作';
      if (!task.blockingReasons.includes(detail)) task.blockingReasons.push(detail);
      if (!taskExceptions.some(item => item.taskId === task.id && item.status === 'open')) {
        taskExceptions.unshift({ id: nextTelemetryId('EXC'), taskId: task.id, equipmentId, kind: health === 'maintenance' ? 'device-maintenance' : 'device-lost-contact', reason: detail, status: 'open', createdAt: at });
      }
      addTimelineEvent(telemetryStates.get(equipmentId)!, { at, type: 'task-impact', reason: `执行中任务 ${task.id} 生成人工确认异常`, taskId: task.id });
    }
  }
  recordAudit('EQUIPMENT_HEALTH_IMPACT', 'equipment', equipmentId, `${machine?.name ?? equipmentId} -> ${health}；${reason}`);
}
function commitHealthState(state: TelemetryDeviceState, nextState: DeviceHealthState, nextRisks: DeviceRiskKind[], at: string, reason: string, heartbeatId?: string) {
  const previousState = state.healthState;
  const previousRisks = new Set(state.risks);
  const raised = nextRisks.filter(risk => !previousRisks.has(risk));
  const cleared = [...previousRisks].filter(risk => !nextRisks.includes(risk));
  state.healthState = nextState;
  state.risks = nextRisks;
  syncEquipment(state);
  if (previousState !== nextState) {
    addTimelineEvent(state, { at, type: 'health-transition', fromState: previousState, toState: nextState, reason, heartbeatId });
    if (nextState === 'maintenance' || nextState === 'lost-contact') affectTasksForUnhealthyEquipment(state.equipmentId, nextState, at);
  }
  for (const risk of raised) addTimelineEvent(state, { at, type: 'risk-raised', risk, reason: `识别运行风险：${risk}`, heartbeatId });
  for (const risk of cleared) addTimelineEvent(state, { at, type: 'risk-cleared', risk, reason: `运行风险解除：${risk}`, heartbeatId });
}
function evaluateTimeouts(now = telemetryNow()) {
  for (const state of telemetryStates.values()) {
    const age = now - state.latestHeartbeatAt;
    if (state.mode === 'maintenance') continue;

    if (age >= TELEMETRY_RULES.lostHeartbeatMs && (state.healthState === 'online' || state.healthState === 'degraded')) {
      const staleAt = state.latestHeartbeatAt + TELEMETRY_RULES.staleHeartbeatMs;
      commitHealthState(state, 'stale', baseRisksForAge('stale', TELEMETRY_RULES.staleHeartbeatMs, state.risks), toIso(staleAt), `心跳年龄达到 ${TELEMETRY_RULES.staleHeartbeatMs / 1000} 秒`);
    }

    const currentAge = now - state.latestHeartbeatAt;
    let next: DeviceHealthState;
    if (state.healthState === 'reconnecting') next = currentAge >= TELEMETRY_RULES.lostHeartbeatMs ? 'lost-contact' : 'reconnecting';
    else next = targetHealthState(state.mode, state.healthState, currentAge, state.risks);
    const risks = baseRisksForAge(next, currentAge, state.risks);
    if (next !== state.healthState || risks.join('|') !== state.risks.join('|')) {
      const reason = next === 'lost-contact' ? `超过 ${TELEMETRY_RULES.lostHeartbeatMs / 1000} 秒未收到新鲜心跳` : `心跳年龄 ${Math.round(currentAge / 1000)} 秒`;
      commitHealthState(state, next, risks, toIso(now), reason);
    }
  }
}
function parseHeartbeat(input: TelemetryHeartbeatInput, now: number): HeartbeatResultItem & { eventAt?: number } {
  const reject = (reason: string, status: HeartbeatResultItem['status'] = 'rejected'): HeartbeatResultItem => ({ id: String(input?.id ?? ''), equipmentId: input?.equipmentId, status, reason });
  if (!input || typeof input !== 'object') return reject('心跳必须是对象');
  if (!input.id || typeof input.id !== 'string') return reject('缺少幂等消息 ID');
  if (!input.equipmentId || typeof input.equipmentId !== 'string') return reject('缺少设备 ID');
  if (!equipment.some(item => item.id === input.equipmentId)) return reject(`设备 ${input.equipmentId} 不存在`);
  if (input.battery !== undefined && (input.battery < 0 || input.battery > 100)) return reject('电量必须在 0–100 之间');
  if (input.seq !== undefined && (!Number.isInteger(input.seq) || input.seq < 0)) return reject('序列号必须是非负整数');
  if (input.mode && input.mode !== 'normal' && input.mode !== 'maintenance') return reject('设备模式只能是 normal 或 maintenance');
  const eventAt = input.at ? new Date(input.at).getTime() : now;
  if (!Number.isFinite(eventAt)) return reject('心跳时间格式无效');
  if (eventAt > now + TELEMETRY_RULES.maxFutureClockSkewMs) return reject('心跳时间超过允许的时钟偏移', 'rejected-expired');
  if (eventAt < now - TELEMETRY_RULES.maxHeartbeatAgeMs) return reject(`心跳已超过 ${TELEMETRY_RULES.maxHeartbeatAgeMs / 1000} 秒过期窗口`, 'rejected-expired');
  return { id: input.id, equipmentId: input.equipmentId, status: 'applied', eventAt };
}
function applyHeartbeat(input: TelemetryHeartbeatInput, state: TelemetryDeviceState, eventAt: number, now: number): HeartbeatResultItem {
  const age = now - eventAt;
  const fresh = age < TELEMETRY_RULES.staleHeartbeatMs;
  const previousConnectionId = state.connectionId;
  if (input.connectionId) state.connectionId = input.connectionId;
  const reconnecting = Boolean(input.connectionId && previousConnectionId && input.connectionId !== previousConnectionId && fresh);

  if (state.healthState === 'lost-contact') {
    if (!fresh) return { id: input.id, equipmentId: input.equipmentId, status: 'ignored-late', healthState: state.healthState, reason: '失联设备收到延迟上报，不视为恢复；仍需连续两次新鲜心跳' };
    if (input.seq !== undefined) {
      state.lastSeq = Math.max(state.lastSeq, input.seq);
      state.lastFreshSeq = Math.max(state.lastFreshSeq, input.seq);
    }
    state.latestHeartbeatAt = eventAt; state.lastAcceptedAt = now; state.mode = input.mode ?? 'normal';
    if (input.location) state.lastLocation = input.location;
    if (input.battery !== undefined) state.lastBattery = input.battery;
    addTimelineEvent(state, { at: toIso(now), type: 'reconnect', reason: reconnecting ? `检测到新连接 ${state.connectionId}，等待第二次新鲜心跳确认` : '收到首个新鲜心跳，等待第二次确认', heartbeatId: input.id });
    commitHealthState(state, 'reconnecting', baseRisksForAge('reconnecting', age, state.risks), toIso(now), '失联后首次新鲜心跳，进入恢复观察', input.id);
    return { id: input.id, equipmentId: input.equipmentId, status: 'applied', healthState: state.healthState };
  }

  if (state.healthState === 'reconnecting') {
    if (!fresh) return { id: input.id, equipmentId: input.equipmentId, status: 'ignored-late', healthState: state.healthState, reason: '恢复观察期间收到延迟上报，仍需第二次新鲜心跳' };
  }

  if (state.healthState === 'maintenance' && (input.mode ?? 'normal') !== 'maintenance' && !fresh) {
    return { id: input.id, equipmentId: input.equipmentId, status: 'ignored-late', healthState: state.healthState, reason: '维护设备不能凭一次延迟上报恢复' };
  }

  if (input.seq !== undefined) state.lastSeq = Math.max(state.lastSeq, input.seq);
  state.lastFreshSeq = fresh ? state.lastSeq : state.lastFreshSeq;
  state.lastAcceptedAt = now;
  state.mode = input.mode ?? state.mode;
  const battery = calculateBatteryRisk(state, input.battery, eventAt);
  state.latestHeartbeatAt = eventAt;
  if (input.location) state.lastLocation = input.location;
  state.batteryDropPerMinute = battery.dropRate;
  if (input.battery !== undefined) state.lastBattery = input.battery;
  let risks: DeviceRiskKind[] = calculateRouteRisk(input.equipmentId, input.location, battery.risks)
    .filter(risk => risk !== 'heartbeat-stale' && risk !== 'heartbeat-lost' && risk !== 'reconnect-pending');
  let next = targetHealthState(state.mode, state.healthState, age, risks);
  if (state.healthState === 'reconnecting' && fresh) next = risks.length ? 'degraded' : 'online';
  risks = baseRisksForAge(next, age, risks);
  if (reconnecting) addTimelineEvent(state, { at: toIso(now), type: 'reconnect', reason: `设备重连：${previousConnectionId} -> ${state.connectionId}`, heartbeatId: input.id });
  commitHealthState(state, next, risks, toIso(now), fresh ? '处理新鲜心跳' : `处理延迟 ${Math.round(age / 1000)} 秒的心跳`, input.id);
  return { id: input.id, equipmentId: input.equipmentId, status: 'applied', healthState: state.healthState };
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function ingestHeartbeatBatch(heartbeats: TelemetryHeartbeatInput[], idempotencyKey?: string) {
  if (!idempotencyKey || typeof idempotencyKey !== 'string') throw new TelemetryValidationError('缺少 Idempotency-Key 请求头或 idempotencyKey 字段');
  if (!Array.isArray(heartbeats) || heartbeats.length === 0 || heartbeats.length > 500) throw new TelemetryValidationError('每批必须包含 1–500 条心跳');
  const now = telemetryNow();
  pruneTelemetryCaches(now);
  const requestKey = stableJson(heartbeats);
  const cached = idempotentTelemetryBatches.get(idempotencyKey);
  if (cached) {
    if (cached.requestKey !== requestKey) throw new TelemetryValidationError('同一 Idempotency-Key 不能用于不同心跳批次');
    return cached.response;
  }
  const results: HeartbeatResultItem[] = [];
  const summary = { received: heartbeats.length, applied: 0, duplicated: 0, ignoredOutOfOrder: 0, ignoredLate: 0, rejectedExpired: 0, rejected: 0 };
  for (const input of heartbeats) {
    const parsed = parseHeartbeat(input, now);
    if (parsed.status !== 'applied' || parsed.eventAt === undefined) {
      if (parsed.status === 'rejected-expired') summary.rejectedExpired += 1; else summary.rejected += 1;
      results.push(parsed); continue;
    }
    const known = processedHeartbeats.get(input.id);
    if (known) {
      summary.duplicated += 1;
      results.push({ id: input.id, equipmentId: input.equipmentId, status: 'duplicate', healthState: telemetryStates.get(input.equipmentId)?.healthState, reason: '重复消息 ID，返回首次处理结果' });
      continue;
    }
    const state = telemetryStates.get(input.equipmentId)!;
    const eventAt = parsed.eventAt;
    const fresh = now - eventAt < TELEMETRY_RULES.staleHeartbeatMs;
    const outOfOrder = eventAt < state.latestHeartbeatAt || (input.seq !== undefined && fresh && input.seq <= state.lastFreshSeq) || (input.seq !== undefined && !fresh && input.seq <= state.lastSeq);
    if (outOfOrder) {
      processedHeartbeats.set(input.id, { equipmentId: input.equipmentId, status: 'ignored-out-of-order', at: now, result: { id: input.id, equipmentId: input.equipmentId, status: 'ignored-out-of-order' } });
      summary.ignoredOutOfOrder += 1;
      const item = { id: input.id, equipmentId: input.equipmentId, status: 'ignored-out-of-order' as const, healthState: state.healthState, reason: '乱序心跳不回滚设备状态' };
      addTimelineEvent(state, { at: toIso(now), type: 'heartbeat-ignored', reason: `乱序消息 ${input.id} 已忽略`, heartbeatId: input.id });
      results.push(item); continue;
    }
    const item = applyHeartbeat(input, state, eventAt, now);
    processedHeartbeats.set(input.id, { equipmentId: input.equipmentId, status: item.status, at: now, result: item });
    if (item.status === 'applied') summary.applied += 1;
    else if (item.status === 'ignored-late') summary.ignoredLate += 1;
    results.push(item);
  }
  const response = { ...summary, results };
  idempotentTelemetryBatches.set(idempotencyKey, { at: now, requestKey, response });
  return response;
}
function pruneTelemetryCaches(now: number) {
  for (const [key, value] of idempotentTelemetryBatches) if (now - value.at > TELEMETRY_RULES.idempotencyTtlMs) idempotentTelemetryBatches.delete(key);
  for (const [key, value] of processedHeartbeats) if (now - value.at > TELEMETRY_RULES.idempotencyTtlMs) processedHeartbeats.delete(key);
}
export function telemetryHealthOverview(now = telemetryNow()) {
  evaluateTimeouts(now);
  return equipment.map(machine => {
    const state = telemetryStates.get(machine.id)!;
    const affected = tasks.filter(task => task.equipmentId === machine.id && ['pending-reassignment', 'exception'].includes(task.status));
    const openExceptions = taskExceptions.filter(item => item.equipmentId === machine.id && item.status === 'open').length;
    return { ...machine, telemetry: { healthState: state.healthState, risks: state.risks, lastSeq: state.lastSeq, latestHeartbeatAt: toIso(state.latestHeartbeatAt), lastAcceptedAt: toIso(state.lastAcceptedAt), ageMs: now - state.latestHeartbeatAt, batteryDropPerMinute: state.batteryDropPerMinute, connectionId: state.connectionId, mode: state.mode }, affectedTaskCount: affected.length, openExceptionCount: openExceptions, affectedTasks: affected.map(task => ({ id: task.id, status: task.status, containerId: task.containerId, reason: task.blockingReasons[task.blockingReasons.length - 1] })) };
  });
}
export function equipmentHealthDetail(equipmentId: string, now = telemetryNow()) {
  evaluateTimeouts(now);
  const machine = equipment.find(item => item.id === equipmentId);
  const state = telemetryStates.get(equipmentId);
  if (!machine || !state) return undefined;
  return { equipment: machine, state, timeline: state.timeline, affectedTasks: tasks.filter(task => task.equipmentId === equipmentId), exceptions: taskExceptions.filter(item => item.equipmentId === equipmentId) };
}
export function telemetryTimeline(limit = 100) {
  evaluateTimeouts();
  return Array.from(telemetryStates.values()).flatMap(state => state.timeline).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
export function confirmTaskException(exceptionId: string, action: ConfirmationAction, actor = '中控调度员', note?: string) {
  const item = taskExceptions.find(exception => exception.id === exceptionId);
  if (!item) return undefined;
  if (item.status === 'confirmed') throw new TelemetryValidationError('异常已经确认，请勿重复处理');
  const task = tasks.find(task => task.id === item.taskId);
  if (!task) throw new TelemetryValidationError('异常关联任务不存在');
  item.status = 'confirmed'; item.confirmedAt = toIso(telemetryNow()); item.confirmedBy = actor; item.action = action; item.resolution = note;
  const resolutionText = note ?? (action === 'reassign' ? '人工确认重派' : action === 'continue' ? '人工确认继续执行' : '人工核实后完成');
  task.blockingReasons = task.blockingReasons.filter(reason => !reason.includes('必须由调度员确认'));
  if (action === 'reassign') { task.status = 'pending-reassignment'; task.equipmentId = undefined; }
  if (action === 'continue') task.status = 'executing';
  if (action === 'complete') task.status = 'done';
  task.blockingReasons.push(`异常 ${exceptionId} 已人工确认：${resolutionText}`);
  recordAudit('CONFIRM_DEVICE_EXCEPTION', 'task-exception', exceptionId, `${action} / ${resolutionText}`);
  return { exception: item, task };
}
function seedTelemetry() {
  const now = Date.now();
  const make = (equipmentId: string, ageSeconds: number, extra: Partial<TelemetryDeviceState> = {}): TelemetryDeviceState => ({
    equipmentId, healthState: 'online', lastSeq: 1, lastFreshSeq: 1, latestHeartbeatAt: now - ageSeconds * 1000, lastAcceptedAt: now - Math.max(ageSeconds - 1, 0) * 1000,
    lastLocation: equipment.find(item => item.id === equipmentId)?.location, lastBattery: equipment.find(item => item.id === equipmentId)?.battery, mode: 'normal', risks: [], timeline: [], ...extra
  });
  const states: TelemetryDeviceState[] = [
    make('QC-07', 8), make('YC-12', 18), make('YC-05', 12),
    make('TT-31', 180, {
      healthState: 'lost-contact', mode: 'normal', lastSeq: 4821, connectionId: 'conn-tt31-a',
      lastLocation: '维修通道-3', lastBattery: 38, risks: ['heartbeat-lost']
    }),
    make('RS-02', 300, { healthState: 'maintenance', mode: 'maintenance', lastSeq: 1107, lastAcceptedAt: now - 300 * 1000, risks: [] })
  ];
  for (const state of states) {
    telemetryStates.set(state.equipmentId, state);
    syncEquipment(state);
  }
  const tt = telemetryStates.get('TT-31')!;
  addTimelineEvent(tt, { at: toIso(now - 180_000), type: 'health-transition', fromState: 'stale', toState: 'lost-contact', reason: '超过 90 秒没有新鲜心跳' });
  addTimelineEvent(tt, { at: toIso(now - 52_000), type: 'health-transition', fromState: 'online', toState: 'stale', reason: '在线但没有新心跳' });
  addTimelineEvent(tt, { at: toIso(now - 170_000), type: 'task-impact', reason: '执行中任务 TASK-105 生成人工确认异常', taskId: 'TASK-105' });
  processedHeartbeats.set('HB-SEED-TT-001', { equipmentId: 'TT-31', status: 'applied', at: now - 180000, result: { id: 'HB-SEED-TT-001', equipmentId: 'TT-31', status: 'applied', healthState: 'lost-contact' } });
  const rs = telemetryStates.get('RS-02')!;
  addTimelineEvent(rs, { at: toIso(now - 300_000), type: 'health-transition', fromState: 'online', toState: 'maintenance', reason: '设备上报维护模式' });
  addTimelineEvent(rs, { at: toIso(now - 295_000), type: 'task-impact', reason: '未开始任务 TASK-106 进入待重派', taskId: 'TASK-106' });
  processedHeartbeats.set('HB-SEED-RS-001', { equipmentId: 'RS-02', status: 'applied', at: now - 300000, result: { id: 'HB-SEED-RS-001', equipmentId: 'RS-02', status: 'applied', healthState: 'maintenance' } });
  if (!taskExceptions.some(item => item.id === 'EXC-8001')) {
    taskExceptions.unshift({ id: 'EXC-8001', taskId: 'TASK-105', equipmentId: 'TT-31', kind: 'device-lost-contact', reason: '设备失联：执行中任务不能自动完成，必须由调度员确认后续动作', status: 'open', createdAt: toIso(now - 170_000) });
  }
}
seedTelemetry();
export function resetTelemetryDemoState() {
  equipment.splice(0, equipment.length, ...JSON.parse(JSON.stringify(initialEquipmentSnapshot)));
  tasks.splice(0, tasks.length, ...JSON.parse(JSON.stringify(initialTasksSnapshot)));
  taskExceptions.splice(0, taskExceptions.length, ...JSON.parse(JSON.stringify(initialExceptionsSnapshot)));
  telemetryStates.clear(); processedHeartbeats.clear(); idempotentTelemetryBatches.clear();
  seedTelemetry();
}

function parseSlot(slot: string) { const match = slot.match(/^([A-Z]\d\d)-/); return match?.[1]; }
export function dashboard() {
  const activeVoyages = voyages.filter(v => v.status !== 'departed');
  const yardCapacity = blocks.reduce((sum, block) => sum + block.capacity, 0); const yardOccupied = blocks.reduce((sum, block) => sum + block.occupied, 0);
  return { activeVoyages: activeVoyages.length, berthMoves: activeVoyages.reduce((sum, v) => sum + v.movesPlanned - v.movesDone, 0), yardUtilization: yardOccupied / yardCapacity, gateQueue: appointments.filter(a => a.status === 'checked-in').length + 7, pendingTasks: tasks.filter(t => t.status !== 'done').length, blockedTasks: tasks.filter(t => t.status === 'blocked' || t.status === 'exception').length, pendingReassignments: tasks.filter(t => t.status === 'pending-reassignment').length, openTaskExceptions: taskExceptions.filter(t => t.status === 'open').length, deviceHealthAlerts: equipment.filter(e => ['maintenance', 'lost-contact', 'stale', 'degraded', 'reconnecting'].includes(e.healthState ?? 'online')).length, reeferAlerts: containers.filter(c => c.reefer && (c.customs === 'inspection' || (c.temperature ?? 0) > 5)).length, hazmatHolds: containers.filter(c => c.hazmatClass && c.customs !== 'released').length, lateVessels: activeVoyages.filter(v => v.lateRisk === 'high').length };
}
export function gateConflicts() {
  const result: { severity: 'critical' | 'warning'; appointmentId: string; reason: string }[] = [];
  appointments.forEach((a, index) => appointments.slice(index + 1).forEach(b => {
    const overlap = a.truckNo === b.truckNo && new Date(a.windowStart).getTime() < new Date(b.windowEnd).getTime() && new Date(b.windowStart).getTime() < new Date(a.windowEnd).getTime();
    if (overlap) result.push({ severity: 'critical', appointmentId: a.id, reason: `车辆 ${a.truckNo} 与 ${b.id} 时间窗口重叠，需重新分配闸口时隙` });
  }));
  appointments.filter(a => a.status === 'booked').forEach(a => { const container = containers.find(c => c.id === a.containerId); if (container?.customs !== 'released') result.push({ severity: 'warning', appointmentId: a.id, reason: `箱 ${a.containerId} 海关状态为 ${container?.customs}，无法无条件放行` }); });
  return result;
}
export function yardHeatmap() { return blocks.map(block => ({ ...block, utilization: block.occupied / block.capacity, freeSlots: block.capacity - block.occupied, pressure: block.heat > 85 ? 'critical' : block.heat > 65 ? 'warning' : 'normal' })); }
export function containerPlan(containerId: string) {
  const container = containers.find(c => c.id === containerId); if (!container) return undefined;
  const reasons: string[] = []; const candidates = blocks.filter(block => block.capacity > block.occupied && (!container.hazmatClass || block.hazmatAllowed) && (!container.reefer || block.reeferPlugs > block.usedPlugs));
  if (container.customs !== 'released' && container.status === 'in-yard') reasons.push('海关未放行，必须保持在查验/监管区');
  const ranked = candidates.map(block => ({ block, score: (block.capacity - block.occupied) * 2 - block.heat - (container.reefer && block.reeferPlugs - block.usedPlugs < 3 ? 18 : 0) - (container.hazmatClass && !block.hazmatAllowed ? 100 : 0) })).sort((a, b) => b.score - a.score);
  if (!ranked.length) reasons.push('没有同时满足危险品、冷藏电源与容量约束的区块');
  const selected = ranked[0]?.block; if (container.reefer && selected) reasons.push(`需要占用 ${selected.reeferPlugs - selected.usedPlugs} 个剩余冷插位中的 1 个`);
  if (container.hazmatClass) reasons.push(`危险品 ${container.hazmatClass} 级，只能进入有隔离资质的区块`);
  return { container, recommendedBlock: selected, alternatives: ranked.slice(1, 3).map(item => item.block), reasons };
}
export function prioritizeTasks() { return tasks.map(task => ({ ...task, score: task.priority + (task.blockingReasons.length ? -20 : 10) + (task.kind === 'inspect' ? 12 : 0) })).sort((a, b) => b.score - a.score); }
export function createAppointment(input: Omit<GateAppointment, 'id' | 'status' | 'sealVerified' | 'weightVerified'>) {
  const container = containers.find(item => item.id === input.containerId); if (!container) throw new Error('箱号不存在');
  if (container.customs !== 'released' && input.type === 'pickup') throw new Error('海关未放行，不能预约提箱');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false }; appointments.unshift(item); container.appointmentId = item.id; return item;
}
export function updateAppointment(id: string, patch: Partial<Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) { const item = appointments.find(a => a.id === id); if (!item) return undefined; Object.assign(item, patch); const container = containers.find(c => c.id === item.containerId); if (item.status === 'checked-in' && container) container.status = 'at-gate'; if (item.status === 'completed' && container) container.status = item.type === 'pickup' ? 'released' : 'in-yard'; auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '闸口值班员', action: 'GATE_UPDATE', entity: 'appointment', entityId: id, at: new Date().toISOString(), details: JSON.stringify(patch) }); return item; }
export function assignTask(id: string, equipmentId: string) {
  const task = tasks.find(item => item.id === id);
  const machine = equipment.find(item => item.id === equipmentId);
  if (!task || !machine) return undefined;
  if (task.status === 'exception' || taskExceptions.some(exception => exception.taskId === id && exception.status === 'open')) throw new Error('存在未确认的设备异常，不能重新指派；请先在遥测异常中人工确认');
  const blockingReasons = task.blockingReasons.filter(reason => !reason.includes('当前不可用') && !reason.includes('进入待重派'));
  const state = telemetryStates.get(equipmentId);
  if (machine.status === 'maintenance' || machine.status === 'offline' || state?.healthState === 'maintenance' || state?.healthState === 'lost-contact') blockingReasons.push(`${machine.name} 当前不可用，任务将保持待重派`);
  if (task.kind === 'inspect' && machine.kind !== 'reach-stacker') blockingReasons.push('查验作业需要正面吊或专用设备');
  task.equipmentId = equipmentId;
  if (blockingReasons.some(reason => reason.includes('当前不可用'))) task.status = 'pending-reassignment';
  else if (task.status === 'pending-reassignment') task.status = 'assigned';
  else task.status = task.status === 'executing' ? 'executing' : 'assigned';
  task.blockingReasons = blockingReasons;
  auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action: 'ASSIGN_TASK', entity: 'yard-task', entityId: id, at: new Date().toISOString(), details: `${equipmentId} -> ${task.containerId}` });
  return task;
}
export function containerDetail(id: string) { const container = containers.find(item => item.id === id); if (!container) return undefined; return { container, voyage: voyages.find(v => v.id === container.voyageId), appointment: appointments.find(a => a.id === container.appointmentId), plan: containerPlan(id), tasks: tasks.filter(t => t.containerId === id) }; }

export type ContainerInput = Omit<Container, 'lastEvent' | 'appointmentId'> & { appointmentId?: string };
export type AppointmentInput = Pick<GateAppointment, 'containerId' | 'truckNo' | 'driver' | 'type' | 'windowStart' | 'windowEnd' | 'lane'>;
export type TaskInput = Pick<YardTask, 'kind' | 'containerId' | 'from' | 'to' | 'priority' | 'scheduledAt' | 'estimatedMinutes'> & { equipmentId?: string };

function recordAudit(action: string, entity: string, entityId: string, details: string) {
  auditEvents.unshift({ id: `AUD-${Date.now()}`, actor: '中控调度员', action, entity, entityId, at: new Date().toISOString(), details });
}

export function createContainer(input: ContainerInput) {
  const id = input.id.trim().toUpperCase();
  if (!id) throw new Error('箱号不能为空');
  if (containers.some(item => item.id === id)) throw new Error(`箱号 ${id} 已存在`);
  if (!voyages.some(item => item.id === input.voyageId)) throw new Error('关联航次不存在');
  const blockId = parseSlot(input.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (input.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  if (input.reefer && blockId) {
    const block = blocks.find(item => item.id === blockId);
    if (block && block.reeferPlugs <= block.usedPlugs) throw new Error('当前区块没有可用冷藏插座');
  }
  const item: Container = { ...input, id, lastEvent: `人工建档 ${new Date().toLocaleString()}` };
  containers.unshift(item);
  recordAudit('CREATE', 'container', item.id, '新增集装箱台账记录');
  return item;
}

export function updateContainer(id: string, patch: Partial<Omit<Container, 'id' | 'lastEvent'>>) {
  const item = containers.find(container => container.id === id);
  if (!item) return undefined;
  if (patch.voyageId && !voyages.some(voyage => voyage.id === patch.voyageId)) throw new Error('关联航次不存在');
  const next = { ...item, ...patch };
  const blockId = parseSlot(next.yardSlot);
  if (blockId && !blocks.some(block => block.id === blockId)) throw new Error('堆位所属区块不存在');
  if (next.hazmatClass && blockId && !blocks.find(block => block.id === blockId)?.hazmatAllowed) throw new Error('危险品不能进入当前堆场区块');
  Object.assign(item, patch, { lastEvent: `台账更新 ${new Date().toLocaleString()}` });
  recordAudit('UPDATE', 'container', id, '更新集装箱台账字段');
  return item;
}

export function deleteContainer(id: string) {
  const index = containers.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = containers.splice(index, 1);
  const removedAppointments = appointments.filter(appointment => appointment.containerId === id);
  for (const appointment of removedAppointments) appointments.splice(appointments.indexOf(appointment), 1);
  const removedTasks = tasks.filter(task => task.containerId === id);
  for (const task of removedTasks) tasks.splice(tasks.indexOf(task), 1);
  recordAudit('DELETE', 'container', id, `删除箱务记录，并级联清理 ${removedAppointments.length} 条预约、${removedTasks.length} 条未完成任务`);
  return item;
}

export function createGateAppointment(input: AppointmentInput) {
  const container = containers.find(item => item.id === input.containerId);
  if (!container) throw new Error('箱号不存在');
  if (input.type === 'pickup' && container.customs !== 'released') throw new Error('海关未放行，不能预约提箱');
  if (new Date(input.windowEnd) <= new Date(input.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const item: GateAppointment = { ...input, id: `APT-${Date.now()}`, status: 'booked', sealVerified: false, weightVerified: false };
  appointments.unshift(item);
  container.appointmentId = item.id;
  recordAudit('CREATE', 'appointment', item.id, `为 ${item.containerId} 创建闸口预约`);
  return item;
}

export function editGateAppointment(id: string, patch: Partial<AppointmentInput & Pick<GateAppointment, 'status' | 'sealVerified' | 'weightVerified' | 'exception'>>) {
  const item = appointments.find(appointment => appointment.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('箱号不存在');
  if (patch.windowStart && patch.windowEnd && new Date(patch.windowEnd) <= new Date(patch.windowStart)) throw new Error('预约结束时间必须晚于开始时间');
  const previousContainer = containers.find(container => container.id === item.containerId);
  Object.assign(item, patch);
  const nextContainer = containers.find(container => container.id === item.containerId);
  if (previousContainer && previousContainer.id !== nextContainer?.id && previousContainer.appointmentId === id) previousContainer.appointmentId = undefined;
  if (nextContainer) nextContainer.appointmentId = id;
  if (item.status === 'checked-in' && nextContainer) nextContainer.status = 'at-gate';
  if (item.status === 'completed' && nextContainer) nextContainer.status = item.type === 'pickup' ? 'released' : 'in-yard';
  recordAudit('UPDATE', 'appointment', id, `更新预约状态/时隙：${JSON.stringify(patch)}`);
  return item;
}

export function deleteGateAppointment(id: string) {
  const index = appointments.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = appointments.splice(index, 1);
  const container = containers.find(entry => entry.id === item.containerId);
  if (container?.appointmentId === id) container.appointmentId = undefined;
  recordAudit('DELETE', 'appointment', id, `取消并删除 ${item.containerId} 的闸口预约`);
  return item;
}

export function createYardTask(input: TaskInput) {
  if (!containers.some(container => container.id === input.containerId)) throw new Error('关联箱号不存在');
  if (input.priority < 1 || input.priority > 100) throw new Error('优先级范围为 1–100');
  if (input.estimatedMinutes <= 0) throw new Error('预计作业时长必须大于 0');
  const machine = input.equipmentId ? equipment.find(item => item.id === input.equipmentId) : undefined;
  const unhealthy = machine?.status === 'maintenance' || machine?.status === 'offline' || ['maintenance', 'lost-contact'].includes(machine?.healthState ?? '');
  const item: YardTask = { ...input, id: `TASK-${Date.now()}`, status: unhealthy ? 'pending-reassignment' : input.equipmentId ? 'assigned' : 'queued', blockingReasons: unhealthy ? [`${input.equipmentId} 当前不可用，任务进入待重派`] : [], scheduledAt: input.scheduledAt };
  tasks.unshift(item);
  recordAudit('CREATE', 'yard-task', item.id, `创建 ${input.kind} 任务，关联 ${input.containerId}`);
  return item;
}

export function updateYardTask(id: string, patch: Partial<TaskInput & Pick<YardTask, 'status' | 'blockingReasons'>>) {
  const item = tasks.find(task => task.id === id);
  if (!item) return undefined;
  if (patch.containerId && !containers.some(container => container.id === patch.containerId)) throw new Error('关联箱号不存在');
  if (patch.priority !== undefined && (patch.priority < 1 || patch.priority > 100)) throw new Error('优先级范围为 1–100');
  if (patch.status === 'done' && (item.status === 'exception' || taskExceptions.some(exception => exception.taskId === id && exception.status === 'open'))) throw new Error('设备异常任务必须先人工确认，不能静默标记为已完成');
  if (patch.status === 'exception') throw new Error('exception 状态只能由设备健康联动或人工确认异常产生');
  Object.assign(item, patch);
  recordAudit('UPDATE', 'yard-task', id, `更新场内作业任务：${JSON.stringify(patch)}`);
  return item;
}

export function deleteYardTask(id: string) {
  const index = tasks.findIndex(item => item.id === id);
  if (index < 0) return undefined;
  const [item] = tasks.splice(index, 1);
  recordAudit('DELETE', 'yard-task', id, `删除 ${item.containerId} 的场内任务`);
  return item;
}
