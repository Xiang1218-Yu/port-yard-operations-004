import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Dashboard = { activeVoyages: number; berthMoves: number; yardUtilization: number; gateQueue: number; pendingTasks: number; blockedTasks: number; pendingReassignments?: number; openTaskExceptions?: number; deviceHealthAlerts?: number; reeferAlerts: number; hazmatHolds: number; lateVessels: number };
type Voyage = { id: string; vessel: string; service: string; eta: string; etd: string; status: string; berth: string; movesPlanned: number; movesDone: number; lateRisk: string };
type Container = { id: string; voyageId: string; size: '20'|'40'|'45'; isoType: string; direction: 'import'|'export'|'transshipment'; status: string; weightT: number; reefer: boolean; temperature?: number; hazmatClass?: string; customs: 'released'|'inspection'|'hold'; priority: string; yardSlot: string; appointmentId?: string; lastEvent: string };
type Block = { id: string; zone: string; capacity: number; occupied: number; reeferPlugs: number; usedPlugs: number; hazmatAllowed: boolean; heat: number; utilization: number; freeSlots: number; pressure: string };
type Conflict = { severity: string; appointmentId: string; reason: string };
type Appointment = { id: string; containerId: string; truckNo: string; driver: string; type: 'pickup'|'dropoff'; windowStart: string; windowEnd: string; lane: 'north'|'south'|'rail'; status: string; exception?: string };
type Task = { id: string; kind: string; containerId: string; from: string; to: string; equipmentId?: string; priority: number; score: number; status: string; blockingReasons: string[]; estimatedMinutes: number; scheduledAt: string };
type Equipment = { id: string; name: string; kind: string; status: string; location: string; battery: number; queue: number; movesPerHour: number; healthState?: string; lastHeartbeatAt?: string; lastAcceptedAt?: string; healthRisks?: DeviceRisk[]; telemetry?: { healthState: string; risks: DeviceRisk[]; lastSeq: number; latestHeartbeatAt: string; lastAcceptedAt: string; ageMs: number; batteryDropPerMinute?: number; connectionId?: string; mode: string }; affectedTaskCount?: number; openExceptionCount?: number; affectedTasks?: { id: string; status: string; containerId: string; reason?: string }[] };
type DeviceRisk = 'heartbeat-stale' | 'heartbeat-lost' | 'battery-fast-drop' | 'route-mismatch' | 'reconnect-pending';
type TimelineEvent = { id: string; equipmentId: string; at: string; type: string; fromState?: string; toState?: string; risk?: string; reason: string; taskId?: string };
type TaskException = { id: string; taskId: string; equipmentId: string; kind: string; reason: string; status: 'open' | 'confirmed'; createdAt: string; confirmedAt?: string; action?: 'continue'|'reassign'|'complete' };
type Section = 'control'|'containers'|'gate'|'yard'|'tasks'|'telemetry';
type Editor = { entity: 'container'|'appointment'|'task'; mode: 'create'|'edit'; id?: string; values: Record<string, string|boolean> };

const api = '/api';
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const healthLabel = (value?: string) => ({ online: '在线', reconnecting: '重连确认中', stale: '心跳老化', degraded: '运行降级', maintenance: '维护中', 'lost-contact': '失联' }[value ?? 'online'] ?? value);
const riskLabel = (risk: string) => ({ 'heartbeat-stale': '在线但无新心跳', 'heartbeat-lost': '心跳失联', 'battery-fast-drop': '电量快速下降', 'route-mismatch': '位置偏离任务路线', 'reconnect-pending': '等待重连确认' }[risk] ?? risk);
const ago = (ms: number) => ms < 0 ? `未来 ${Math.round(-ms / 1000)}s` : ms > 60000 ? `${Math.round(ms / 60000)}m ago` : `${Math.round(ms / 1000)}s ago`;
const toLocalInput = (value?: string) => {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const defaultValues = (entity: Editor['entity']): Record<string, string|boolean> => {
  if (entity === 'container') return { id: '', voyageId: 'VOY-AX7', size: '40', isoType: '45G1', direction: 'import', status: 'in-yard', weightT: '20', reefer: false, temperature: '4', hazmatClass: '', customs: 'released', priority: 'normal', yardSlot: 'C03-R01-T1' };
  if (entity === 'appointment') return { containerId: '', truckNo: '', driver: '', type: 'pickup', windowStart: toLocalInput(), windowEnd: toLocalInput(new Date(Date.now() + 60 * 60000).toISOString()), lane: 'north' };
  return { kind: 'receive', containerId: '', from: '闸口', to: 'C03-R01-T1', equipmentId: '', priority: '50', scheduledAt: toLocalInput(), estimatedMinutes: '20', status: 'queued' };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body as T;
}

export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [voyages, setVoyages] = useState<Voyage[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [exceptions, setExceptions] = useState<TaskException[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('TT-31');
  const [selectedEquipmentDetail, setSelectedEquipmentDetail] = useState<{ timeline: TimelineEvent[]; exceptions: TaskException[] }>();
  const [heartbeatJson, setHeartbeatJson] = useState('[]');
  const [heartbeatKey, setHeartbeatKey] = useState(`ui-batch-${Date.now()}`);
  const [ingestionResult, setIngestionResult] = useState('');
  const [tab, setTab] = useState<Section>('control');
  const [selectedVoyage, setSelectedVoyage] = useState('VOY-AX7');
  const [editor, setEditor] = useState<Editor>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [d, v, ctn, b, cf, a, t, e, tl, ex] = await Promise.all([
      request<Dashboard>('/dashboard'), request<Voyage[]>('/voyages'), request<Container[]>('/containers'),
      request<Block[]>('/yard/heatmap'), request<Conflict[]>('/gate/conflicts'), request<Appointment[]>('/gate/appointments'),
      request<Task[]>('/tasks'), request<Equipment[]>('/equipment'), request<TimelineEvent[]>('/telemetry/timeline?limit=120'), request<TaskException[]>('/task-exceptions')
    ]);
    setDashboard(d); setVoyages(v); setContainers(ctn); setBlocks(b); setConflicts(cf); setAppointments(a); setTasks(t); setEquipment(e); setTimeline(tl); setExceptions(ex);
  }, []);
  useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : '无法连接服务端')); }, [load]);

  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setError('');
    try {
      await request(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      await load(); setEditor(undefined); setMessage('操作已保存，作业台数据已刷新');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const openCreate = (entity: Editor['entity']) => { setError(''); setEditor({ entity, mode: 'create', values: defaultValues(entity) }); };
  const openEdit = (entity: Editor['entity'], id: string, values: Record<string, string|boolean>) => { setError(''); setEditor({ entity, mode: 'edit', id, values: { ...values } }); };
  const updateField = (key: string, value: string|boolean) => setEditor(current => current ? { ...current, values: { ...current.values, [key]: value } } : current);
  const saveEditor = async (event: FormEvent) => {
    event.preventDefault(); if (!editor) return;
    const { entity, mode, id, values } = editor;
    const payload: Record<string, unknown> = entity === 'container' ? {
      ...(mode === 'create' ? { id: values.id } : {}), voyageId: values.voyageId, size: values.size, isoType: values.isoType,
      direction: values.direction, status: values.status, weightT: Number(values.weightT), reefer: Boolean(values.reefer),
      ...(values.reefer ? { temperature: Number(values.temperature) } : {}), ...(values.hazmatClass ? { hazmatClass: values.hazmatClass } : {}),
      customs: values.customs, priority: values.priority, yardSlot: values.yardSlot
    } : entity === 'appointment' ? {
      containerId: values.containerId, truckNo: values.truckNo, driver: values.driver, type: values.type,
      windowStart: new Date(String(values.windowStart)).toISOString(), windowEnd: new Date(String(values.windowEnd)).toISOString(), lane: values.lane
    } : {
      kind: values.kind, containerId: values.containerId, from: values.from, to: values.to, priority: Number(values.priority),
      scheduledAt: new Date(String(values.scheduledAt)).toISOString(), estimatedMinutes: Number(values.estimatedMinutes),
      ...(values.equipmentId ? { equipmentId: values.equipmentId } : {}), ...(mode === 'edit' ? { status: values.status } : {})
    };
    await mutate(entity === 'container' ? `/containers${mode === 'edit' ? `/${id}` : ''}` : entity === 'appointment' ? `/gate/appointments${mode === 'edit' ? `/${id}` : ''}` : `/tasks${mode === 'edit' ? `/${id}` : ''}`, mode === 'create' ? 'POST' : 'PATCH', payload);
  };
  const remove = async (entity: Editor['entity'], id: string) => {
    if (!window.confirm(`确认删除 ${id}？相关数据的联动处理会写入审计记录。`)) return;
    const path = entity === 'container' ? `/containers/${id}` : entity === 'appointment' ? `/gate/appointments/${id}` : `/tasks/${id}`;
    await mutate(path, 'DELETE');
  };
  const updateAppointmentStatus = async (id: string, status: string) => mutate(`/gate/appointments/${id}`, 'PATCH', { status });
  const assign = async (id: string, equipmentId: string) => equipmentId ? mutate(`/tasks/${id}/assign`, 'PATCH', { equipmentId }) : mutate(`/tasks/${id}`, 'PATCH', { equipmentId: '', status: 'queued' });
  const loadEquipmentDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const detail = await request<{ timeline: TimelineEvent[]; exceptions: TaskException[] }>(`/telemetry/equipment/${id}`);
      setSelectedEquipmentId(id); setSelectedEquipmentDetail(detail);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法加载设备时间线'); }
  }, []);
  const sendHeartbeats = async () => {
    setBusy(true); setError(''); setIngestionResult('');
    try {
      let heartbeats: unknown;
      try { heartbeats = JSON.parse(heartbeatJson); } catch { throw new Error('心跳 JSON 格式不正确'); }
      const result = await request<{ received: number; applied: number; duplicated: number; ignoredOutOfOrder: number; ignoredLate: number; rejectedExpired: number; rejected: number }>('/telemetry/heartbeats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': heartbeatKey },
        body: JSON.stringify({ heartbeats })
      });
      setIngestionResult(`收到 ${result.received}；应用 ${result.applied}；重复 ${result.duplicated}；乱序 ${result.ignoredOutOfOrder}；延迟 ${result.ignoredLate}；过期/拒绝 ${result.rejectedExpired + result.rejected}`);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '心跳接入失败'); }
    finally { setBusy(false); }
  };
  const fillHeartbeatScenario = (scenario: 'fresh' | 'duplicate' | 'stale' | 'battery' | 'route' | 'maintenance') => {
    const id = `UI-${scenario.toUpperCase()}-${Date.now()}`;
    const now = new Date().toISOString();
    if (scenario === 'fresh') setHeartbeatJson(JSON.stringify([{ id, equipmentId: selectedEquipmentId, at: now, seq: Date.now() % 100000, location: 'B07-R03', battery: 76, connectionId: `conn-${Date.now()}`, mode: 'normal' }], null, 2));
    if (scenario === 'duplicate') setHeartbeatJson(JSON.stringify([{ id: 'DUP-UI-001', equipmentId: selectedEquipmentId, at: now, seq: 1, battery: 80 }, { id: 'DUP-UI-001', equipmentId: selectedEquipmentId, at: now, seq: 1, battery: 80 }], null, 2));
    if (scenario === 'stale') setHeartbeatJson(JSON.stringify([{ id: `${id}-late`, equipmentId: selectedEquipmentId, at: new Date(Date.now() - 70000).toISOString(), seq: 10, battery: 60 }], null, 2));
    if (scenario === 'battery') setHeartbeatJson(JSON.stringify([{ id, equipmentId: selectedEquipmentId, at: now, seq: Date.now() % 100000, battery: 5, routeStatus: 'on-route' }], null, 2));
    if (scenario === 'route') setHeartbeatJson(JSON.stringify([{ id, equipmentId: selectedEquipmentId, at: now, seq: Date.now() % 100000, location: 'A99-维修通道', battery: 72 }], null, 2));
    if (scenario === 'maintenance') setHeartbeatJson(JSON.stringify([{ id, equipmentId: selectedEquipmentId, at: now, seq: Date.now() % 100000, battery: 70, mode: 'maintenance' }], null, 2));
    setIngestionResult('');
  };
  const confirmException = async (exceptionId: string, action: 'continue'|'reassign'|'complete') => {
    if (!window.confirm(`确认对异常执行「${action === 'continue' ? '继续执行' : action === 'reassign' ? '重派设备' : '核实完成'}」？该动作会写入审计。`)) return;
    setBusy(true);
    try {
      await request(`/task-exceptions/${exceptionId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, actor: '控制台调度员' }) });
      await Promise.all([load(), loadEquipmentDetail(selectedEquipmentId)]);
      setMessage('设备异常已人工确认，任务队列已联动更新');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '确认异常失败'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void loadEquipmentDetail(selectedEquipmentId); }, [selectedEquipmentId, equipment.length, loadEquipmentDetail]);
  const selected = voyages.find(voyage => voyage.id === selectedVoyage);
  const remaining = selected ? selected.movesPlanned - selected.movesDone : 0;
  const maxHeat = useMemo(() => Math.max(...blocks.map(block => block.heat), 1), [blocks]);
  const selectedEquipment = equipment.find(item => item.id === selectedEquipmentId);
  const selectedTimeline = selectedEquipmentDetail?.timeline ?? timeline.filter(event => event.equipmentId === selectedEquipmentId);

  if (!dashboard && error) return <main className="connection-error"><div className="eyebrow">API CONNECTION ERROR</div><h1>无法连接港口作业服务</h1><p>{error}</p><p>请从项目根目录运行 <code>npm run dev</code>，确认前端 5178 和 API 4107 均已启动。</p><button onClick={() => { setError(''); void load().catch(reason => setError(reason instanceof Error ? reason.message : '无法连接服务端')); }}>重新连接</button></main>;
  if (!dashboard) return <div className="loading">正在连接码头实时作业中台…</div>;

  return <main>
    <header><div><div className="eyebrow">PORT OPS / YARD & GATE CONTROL</div><h1>HarborGrid <span>港口集装箱堆场协同与闸口调度</span></h1><p>把船期、箱务、堆场容量、危险品/冷藏约束、闸口预约与场内设备任务放在同一条作业链路上。</p></div><div className="header-right"><span className="live"><i/> TOS LINKED</span><span className="clock">LIVE · {new Date().toLocaleTimeString()}</span></div></header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message} ×</div>}{error && <div className="form-error page-error">{error}<button onClick={() => setError('')}>关闭</button></div>}
    <section className="kpis"><div><small>ACTIVE VESSELS</small><b>{dashboard.activeVoyages}<em> 艘</em></b><span>{dashboard.lateVessels} 艘存在延误风险</span></div><div><small>YARD UTILIZATION</small><b>{pct(dashboard.yardUtilization)}</b><span>可用堆位 / 危险品隔离纳管</span></div><div><small>GATE QUEUE</small><b>{dashboard.gateQueue}<em> 车</em></b><span>预约、已进场与车道排队</span></div><div><small>EXCEPTIONS</small><b>{(dashboard.blockedTasks ?? 0) + (dashboard.openTaskExceptions ?? 0) + dashboard.reeferAlerts + dashboard.hazmatHolds}<em> 项</em></b><span>{dashboard.openTaskExceptions ?? 0} 设备异常 · {dashboard.pendingReassignments ?? 0} 待重派</span></div></section>
    <nav className="tabs"><button className={tab==='control'?'active':''} onClick={() => setTab('control')}>作业驾驶舱</button><button className={tab==='containers'?'active':''} onClick={() => setTab('containers')}>箱务台账 / CRUD</button><button className={tab==='gate'?'active':''} onClick={() => setTab('gate')}>闸口预约</button><button className={tab==='yard'?'active':''} onClick={() => setTab('yard')}>堆场热区</button><button className={tab==='tasks'?'active':''} onClick={() => setTab('tasks')}>设备任务</button><button className={tab==='telemetry'?'active':''} onClick={() => setTab('telemetry')}>设备遥测 {dashboard.openTaskExceptions ? <em className="tab-alert">{dashboard.openTaskExceptions}</em> : null}</button><span>最后同步 {new Date().toLocaleTimeString()}</span></nav>
    {tab === 'control' && <div className="layout"><section className="panel vessel-panel"><div className="panel-head"><div><div className="eyebrow">VESSEL WINDOW / 船期窗口</div><h2>泊位作业进度</h2></div><span className="muted">剩余作业动态计算</span></div>{voyages.map(voyage => <button key={voyage.id} className={`vessel ${selectedVoyage===voyage.id?'selected':''}`} onClick={() => setSelectedVoyage(voyage.id)}><span className={`vessel-dot ${voyage.status}`}/><span className="vessel-main"><b>{voyage.vessel}</b><small>{voyage.id} · {voyage.service} · {voyage.berth}</small><i><em style={{ width: `${Math.min(100, voyage.movesDone / voyage.movesPlanned * 100)}%` }}/></i></span><span className="vessel-move"><b>{voyage.movesDone.toLocaleString()}</b><small>/ {voyage.movesPlanned.toLocaleString()} moves</small></span><strong className={voyage.lateRisk}>{voyage.lateRisk==='high'?'HIGH':voyage.lateRisk==='medium'?'WATCH':'ON TIME'}</strong></button>)}</section><section className="panel focus-panel"><div className="panel-head"><div><div className="eyebrow">SELECTED VOYAGE / {selected?.id}</div><h2>{selected?.vessel}</h2></div><span className={`badge ${selected?.lateRisk}`}>{selected?.status}</span></div><div className="voyage-stats"><div><small>ETA</small><b>{selected&&time(selected.eta)}</b><span>预计靠泊</span></div><div><small>ETD</small><b>{selected&&time(selected.etd)}</b><span>计划离港</span></div><div><small>REMAINING</small><b>{remaining}</b><span>剩余翻箱</span></div></div><div className="berth-map"><div className="water"><span>岸线 / BERTH</span><i className="ship" style={{ left: `${selected?.berth==='B07'?50:24}%` }}>{selected?.vessel}</i><b>B01</b><b>B04</b><b>B07</b><b>B10</b></div></div><div className="callout"><strong>调度策略</strong><span>已把 {dashboard.blockedTasks} 个阻塞任务、{dashboard.gateQueue} 车闸口压力纳入当前窗口；优先保护冷藏与危险品安全约束。</span></div></section><section className="panel wide"><div className="panel-head"><h3>异常与联动信号</h3><span>{conflicts.length} gate conflicts detected</span></div><div className="signal-grid"><div><strong className="critical">{dashboard.blockedTasks}</strong><span>设备/约束阻塞</span><small>最高优先级：海关查验任务</small></div><div><strong className="warning">{conflicts.length}</strong><span>闸口预约冲突</span><small>同车重叠窗口需人工重排</small></div><div><strong className="warning">{dashboard.reeferAlerts}</strong><span>冷藏与温控风险</span><small>查验区电源余量接近阈值</small></div><div><strong className="ok">{equipment.filter(item => item.status==='available').length}</strong><span>可调度设备</span><small>场桥 / 正面吊 / 集卡</small></div></div></section></div>}
    {tab === 'containers' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">CONTAINER REGISTER / CRUD</div><h2>箱务台账</h2><span className="muted">新增、查询、编辑、删除；危险品与冷藏箱受堆场约束校验</span></div><button className="primary-action" onClick={() => openCreate('container')}>＋ 新增箱务</button></div><div className="table container-table"><div className="tr th"><span>箱号 / 航次</span><span>尺寸 / 流向</span><span>箱况 / 海关</span><span>堆位</span><span>重量 / 属性</span><span>操作</span></div>{containers.map(container => <div className="tr" key={container.id}><span><b>{container.id}</b><small>{container.voyageId} · {container.lastEvent}</small></span><span>{container.size}ft · {container.direction}<small>{container.isoType}</small></span><span><b>{container.status}</b><small>海关：{container.customs}</small></span><span>{container.yardSlot}</span><span>{container.weightT}t<small>{container.reefer?`冷藏 ${container.temperature}°C`:container.hazmatClass?`危险品 ${container.hazmatClass} 类`:'普通箱'}</small></span><span className="row-actions"><button onClick={() => openEdit('container', container.id, { ...container, weightT: String(container.weightT), temperature: String(container.temperature ?? 4), hazmatClass: container.hazmatClass ?? '' })}>编辑</button><button className="danger-action" onClick={() => void remove('container', container.id)}>删除</button></span></div>)}</div></section>}
    {tab === 'gate' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">GATE APPOINTMENT / SLOT CONTROL</div><h2>闸口预约与车道状态</h2><span className="muted">支持新增预约、编辑时隙、签到/完成和删除</span></div><button className="primary-action" onClick={() => openCreate('appointment')}>＋ 新增预约</button></div>{conflicts.map(conflict => <div className="conflict" key={`${conflict.appointmentId}-${conflict.reason}`}><strong>{conflict.severity}</strong><b>{conflict.appointmentId}</b><span>{conflict.reason}</span></div>)}<div className="table"><div className="tr th"><span>预约</span><span>箱号 / 车辆</span><span>窗口</span><span>车道</span><span>状态</span><span>操作</span></div>{appointments.map(appointment => <div className="tr" key={appointment.id}><span><b>{appointment.id}</b><small>{appointment.type}</small></span><span><b>{appointment.containerId}</b><small>{appointment.truckNo} · {appointment.driver}</small></span><span>{time(appointment.windowStart)}—{time(appointment.windowEnd)}</span><span>{appointment.lane}</span><span className={`pill ${appointment.status}`}>{appointment.status}</span><span className="row-actions">{appointment.status==='booked'?<button onClick={() => void updateAppointmentStatus(appointment.id, 'checked-in')}>签到</button>:appointment.status==='checked-in'?<button onClick={() => void updateAppointmentStatus(appointment.id, 'completed')}>完成</button>:null}<button onClick={() => openEdit('appointment', appointment.id, { ...appointment, windowStart: toLocalInput(appointment.windowStart), windowEnd: toLocalInput(appointment.windowEnd) })}>编辑</button><button className="danger-action" onClick={() => void remove('appointment', appointment.id)}>删除</button></span></div>)}</div></section>}
    {tab === 'yard' && <section className="panel wide"><div className="panel-head"><div><div className="eyebrow">YARD HEATMAP / STACK DENSITY</div><h2>堆场容量与安全约束</h2></div><span className="muted">实时区块压力</span></div><div className="yard-grid">{blocks.map(block => <div className={`block ${block.pressure}`} key={block.id}><div className="block-top"><b>{block.id}</b><strong>{pct(block.utilization)}</strong></div><span>{block.zone}</span><div className="heat"><i style={{ width: `${block.heat / maxHeat * 100}%` }}/></div><div className="block-stats"><span>空位 {block.freeSlots}</span><span>冷插 {block.usedPlugs}/{block.reeferPlugs}</span><span>{block.hazmatAllowed?'危险品可入':'普通区'}</span></div></div>)}</div><div className="yard-note"><span>堆位推荐会同时考虑容量、热区、危险品隔离、冷藏插座和设备可达性。</span><b>A01 → C03 重排建议可释放 21 个低热度堆位</b></div></section>}
    {tab === 'tasks' && <div className="layout"><section className="panel wide"><div className="panel-head"><div><div className="eyebrow">TASK DISPATCH / EQUIPMENT POOL</div><h2>场内任务优先级与设备指派</h2><span className="muted">支持新增、编辑、删除和设备指派</span></div><button className="primary-action" onClick={() => openCreate('task')}>＋ 新建任务</button></div><div className="table task-table"><div className="tr th"><span>任务</span><span>箱号</span><span>路径</span><span>优先级</span><span>状态</span><span>设备 / 操作</span></div>{tasks.map(task => <div className="tr" key={task.id}><span><b>{task.id}</b><small>{task.kind} · {task.estimatedMinutes}min</small></span><span>{task.containerId}</span><span>{task.from} → {task.to}</span><span className={task.score>95?'critical':''}>{task.score}</span><span><span className={`pill ${task.status}`}>{task.status}</span>{task.blockingReasons.length>0&&<small className="blocked-text">{task.blockingReasons[0]}</small>}</span><span className="task-actions"><select value={task.equipmentId??''} disabled={task.status === 'exception'} title={task.status === 'exception' ? '存在未确认异常，请先在设备遥测页处理' : '指派设备'} onChange={event => void assign(task.id, event.target.value)}><option value="">未指派</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => openEdit('task', task.id, { kind: task.kind, containerId: task.containerId, from: task.from, to: task.to, equipmentId: task.equipmentId ?? '', priority: String(task.priority), estimatedMinutes: String(task.estimatedMinutes), scheduledAt: toLocalInput(task.scheduledAt), status: task.status })}>编辑</button><button className="danger-action" onClick={() => void remove('task', task.id)}>删除</button></span></div>)}</div></section><section className="panel"><div className="panel-head"><h3>设备池</h3><span>{equipment.length} assets</span></div>{equipment.map(item => <div className="equipment" key={item.id}><i className={`equip-dot ${item.status}`}/><div><b>{item.name}</b><small>{item.location} · 队列 {item.queue}</small></div><strong>{item.battery}%</strong></div>)}</section></div>}
    {tab === 'telemetry' && <div className="telemetry-page">
      <section className="panel wide telemetry-rules"><div><div className="eyebrow">TELEMETRY INGRESS / HEALTH POLICY</div><h2>岸桥、场桥、集卡、正面吊遥测健康判定</h2><p>批量心跳使用 <code>Idempotency-Key</code>；消息 ID 去重，序列号/事件时间乱序不回滚状态；超过 120 秒过期拒绝；失联恢复需要连续两次新鲜心跳。</p></div><div className="rule-grid"><span>期望心跳 ≤30s</span><span>老化 45s</span><span>失联 90s</span><span>恢复确认 ×2</span></div></section>
      <div className="telemetry-layout">
        <section className="panel"><div className="panel-head"><div><h3>设备健康总览</h3><span className="muted">健康状态来自最新有效心跳与定时巡检</span></div><span>{dashboard.deviceHealthAlerts ?? 0} alerts</span></div><div className="device-health-list">{equipment.map(item => <button key={item.id} type="button" className={`device-health-card ${selectedEquipmentId===item.id?'selected':''} ${item.telemetry?.healthState ?? 'online'}`} onClick={() => void loadEquipmentDetail(item.id)}><div className="device-health-top"><i/><b>{item.name}</b><strong>{healthLabel(item.telemetry?.healthState)}</strong></div><p>{item.location} · seq {item.telemetry?.lastSeq ?? 0} · 心跳年龄 {ago(item.telemetry?.ageMs ?? 0)}</p><div className="risk-tags">{(item.telemetry?.risks ?? []).map(risk => <span key={risk}>{riskLabel(risk)}</span>)}{(!item.telemetry?.risks || item.telemetry.risks.length===0) && <em>无运行风险</em>}</div><small>{item.affectedTaskCount ?? 0} 受影响任务 · {item.openExceptionCount ?? 0} 待确认异常 · 电量 {item.battery}%</small>{item.telemetry?.batteryDropPerMinute ? <small className="critical">下降 {Math.round(item.telemetry.batteryDropPerMinute)}%/min</small> : null}</button>)}</div></section>
        <section className="panel"><div className="panel-head"><div><h3>{selectedEquipment?.name ?? '设备'} 健康时间线</h3><span className="muted">状态变化、风险、任务联动和忽略的延迟/乱序上报</span></div><span className={`state-badge ${selectedEquipment?.telemetry?.healthState ?? 'online'}`}>{healthLabel(selectedEquipment?.telemetry?.healthState)}</span></div><div className="timeline-list">{selectedTimeline.slice(0, 14).map(event => <div className={`timeline-event ${event.type}`} key={event.id}><span/><div><b>{event.fromState ? `${healthLabel(event.fromState)} → ${healthLabel(event.toState)}` : event.type==='risk-raised'?`风险：${riskLabel(event.risk ?? '')}`:event.type==='risk-cleared'?`解除：${riskLabel(event.risk ?? '')}`:event.type==='task-impact'?'任务联动':event.type==='reconnect'?'设备重连':'心跳未应用'}</b><small>{event.reason}</small><em>{event.taskId ? `${event.taskId} · ` : ''}{new Date(event.at).toLocaleString()}</em></div></div>)}</div></section>
      </div>
      <div className="telemetry-layout impact-layout">
        <section className="panel"><div className="panel-head"><h3>受影响任务</h3><span>未开始任务待重派，执行中任务转人工异常</span></div><div className="affected-task-list">{(selectedEquipment?.affectedTasks ?? []).filter(task => ['pending-reassignment','exception'].includes(task.status)).length === 0 ? <p className="empty-state">当前设备没有待重派或异常任务。</p> : (selectedEquipment?.affectedTasks ?? []).filter(task => ['pending-reassignment','exception'].includes(task.status)).map(task => <div className="affected-task" key={task.id}><div><b>{task.id}</b><span className={`pill ${task.status}`}>{task.status === 'pending-reassignment' ? '待重派' : '需人工确认'}</span></div><small>{task.containerId} · {task.reason ?? '等待调度处理'}</small></div>)}</div></section>
        <section className="panel"><div className="panel-head"><h3>人工确认队列</h3><span>{exceptions.filter(item => item.status === 'open').length} open</span></div><div className="exception-list">{exceptions.filter(item => item.status === 'open').length === 0 ? <p className="empty-state">没有未确认的设备异常；设备恢复不会自动完成任务。</p> : exceptions.filter(item => item.status === 'open').map(exception => <div className="task-exception" key={exception.id}><div><b>{exception.taskId}</b><span>{exception.equipmentId}</span></div><p>{exception.reason}</p><div className="exception-actions"><button onClick={() => void confirmException(exception.id, 'continue')}>继续执行</button><button onClick={() => void confirmException(exception.id, 'reassign')}>重派</button><button className="danger-action" onClick={() => void confirmException(exception.id, 'complete')}>核实完成</button></div></div>)}</div></section>
        <section className="panel wide heartbeat-panel"><div className="panel-head"><div><h3>批量心跳接入</h3><span className="muted">POST /api/telemetry/heartbeats · Idempotency-Key 自动生成，重复使用同一批次可验证幂等</span></div></div><div className="scenario-actions"><button onClick={() => fillHeartbeatScenario('fresh')}>新鲜心跳</button><button onClick={() => fillHeartbeatScenario('duplicate')}>重复消息</button><button onClick={() => fillHeartbeatScenario('stale')}>延迟上报</button><button onClick={() => fillHeartbeatScenario('battery')}>电量快降</button><button onClick={() => fillHeartbeatScenario('route')}>路线偏离</button><button onClick={() => fillHeartbeatScenario('maintenance')}>维护</button></div><textarea value={heartbeatJson} onChange={event => setHeartbeatJson(event.target.value)} rows={9}/><div className="idempotency-key"><span>Idempotency-Key</span><code>{heartbeatKey}</code><button type="button" onClick={() => setHeartbeatKey(`ui-batch-${Date.now()}`)}>换新键</button></div><div className="heartbeat-footer"><span>{ingestionResult || '支持一次提交多条心跳，可混用乱序、重复和延迟消息。'}</span><button className="primary-action" disabled={busy} onClick={() => void sendHeartbeats()}>{busy?'接入中…':'发送批次'}</button></div></section>
      </div>
    </div>}
    <footer>HarborGrid · 内存种子数据 + REST API · 箱务台账、闸口预约、场内任务、设备遥测健康与异常确认联动</footer>
    {editor && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setEditor(undefined); }}><form className="editor-modal" onSubmit={saveEditor}><div className="modal-head"><div><div className="eyebrow">{editor.mode.toUpperCase()} / {editor.entity.toUpperCase()}</div><h2>{editor.mode==='create'?'创建':'编辑'}{editor.entity==='container'?'箱务记录':editor.entity==='appointment'?'闸口预约':'作业任务'}</h2></div><button type="button" className="icon-button" onClick={() => setEditor(undefined)}>×</button></div>
      {editor.entity === 'container' && <div className="form-grid">
        <label>集装箱号<input required disabled={editor.mode==='edit'} value={String(editor.values.id)} onChange={event => updateField('id', event.target.value.toUpperCase())}/></label>
        <label>关联航次<select value={String(editor.values.voyageId)} onChange={event => updateField('voyageId', event.target.value)}>{voyages.filter(voyage => voyage.status!=='departed').map(voyage => <option key={voyage.id} value={voyage.id}>{voyage.id} · {voyage.vessel}</option>)}</select></label>
        <label>尺寸<select value={String(editor.values.size)} onChange={event => updateField('size', event.target.value)}><option value="20">20 ft</option><option value="40">40 ft</option><option value="45">45 ft</option></select></label>
        <label>ISO 箱型<input required value={String(editor.values.isoType)} onChange={event => updateField('isoType', event.target.value)}/></label>
        <label>作业流向<select value={String(editor.values.direction)} onChange={event => updateField('direction', event.target.value)}><option value="import">进口</option><option value="export">出口</option><option value="transshipment">中转</option></select></label>
        <label>箱状态<select value={String(editor.values.status)} onChange={event => updateField('status', event.target.value)}>{['in-transit','at-gate','in-yard','on-quay','released','hold'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>重量 (吨)<input type="number" min="0.1" step="0.1" required value={String(editor.values.weightT)} onChange={event => updateField('weightT', event.target.value)}/></label>
        <label>海关状态<select value={String(editor.values.customs)} onChange={event => updateField('customs', event.target.value)}><option value="released">已放行</option><option value="inspection">查验中</option><option value="hold">扣留</option></select></label>
        <label>优先级<select value={String(editor.values.priority)} onChange={event => updateField('priority', event.target.value)}><option value="normal">普通</option><option value="hot">急箱</option><option value="reefer">冷藏</option><option value="hazmat">危险品</option></select></label>
        <label>堆位<input required placeholder="例如 B07-R03-T2" value={String(editor.values.yardSlot)} onChange={event => updateField('yardSlot', event.target.value.toUpperCase())}/></label>
        <label>危险品类别<input placeholder="非危险品留空" value={String(editor.values.hazmatClass)} onChange={event => updateField('hazmatClass', event.target.value)}/></label>
        <label className="check-label"><input type="checkbox" checked={Boolean(editor.values.reefer)} onChange={event => updateField('reefer', event.target.checked)}/>冷藏箱</label>
        {Boolean(editor.values.reefer) && <label>目标温度 (°C)<input type="number" step="0.1" value={String(editor.values.temperature)} onChange={event => updateField('temperature', event.target.value)}/></label>}
      </div>}
      {editor.entity === 'appointment' && <div className="form-grid">
        <label>集装箱<select required value={String(editor.values.containerId)} onChange={event => updateField('containerId', event.target.value)}><option value="">选择箱号</option>{containers.map(container => <option key={container.id} value={container.id}>{container.id} · {container.status}</option>)}</select></label>
        <label>预约类型<select value={String(editor.values.type)} onChange={event => updateField('type', event.target.value)}><option value="pickup">提箱</option><option value="dropoff">进场</option></select></label>
        <label>车牌号<input required value={String(editor.values.truckNo)} onChange={event => updateField('truckNo', event.target.value)}/></label><label>司机<input required value={String(editor.values.driver)} onChange={event => updateField('driver', event.target.value)}/></label>
        <label>窗口开始<input type="datetime-local" required value={String(editor.values.windowStart)} onChange={event => updateField('windowStart', event.target.value)}/></label><label>窗口结束<input type="datetime-local" required value={String(editor.values.windowEnd)} onChange={event => updateField('windowEnd', event.target.value)}/></label>
        <label>闸口车道<select value={String(editor.values.lane)} onChange={event => updateField('lane', event.target.value)}><option value="north">北闸口</option><option value="south">南闸口</option><option value="rail">铁路闸口</option></select></label>
      </div>}
      {editor.entity === 'task' && <div className="form-grid">
        <label>任务类型<select value={String(editor.values.kind)} onChange={event => updateField('kind', event.target.value)}>{['receive','deliver','rehandle','load','discharge','inspect'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>关联箱号<select required value={String(editor.values.containerId)} onChange={event => updateField('containerId', event.target.value)}><option value="">选择箱号</option>{containers.map(container => <option key={container.id} value={container.id}>{container.id}</option>)}</select></label>
        <label>起点<input required value={String(editor.values.from)} onChange={event => updateField('from', event.target.value)}/></label><label>终点<input required value={String(editor.values.to)} onChange={event => updateField('to', event.target.value)}/></label>
        <label>优先级 (1–100)<input type="number" min="1" max="100" required value={String(editor.values.priority)} onChange={event => updateField('priority', event.target.value)}/></label><label>预计时长 (分钟)<input type="number" min="1" required value={String(editor.values.estimatedMinutes)} onChange={event => updateField('estimatedMinutes', event.target.value)}/></label>
        <label>计划时间<input type="datetime-local" required value={String(editor.values.scheduledAt)} onChange={event => updateField('scheduledAt', event.target.value)}/></label><label>指派设备<select value={String(editor.values.equipmentId)} onChange={event => updateField('equipmentId', event.target.value)}><option value="">暂不指派</option>{equipment.map(item => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></label>
        {editor.mode==='edit' && <label>任务状态<select value={String(editor.values.status)} onChange={event => updateField('status', event.target.value)}>{['queued','assigned','executing','blocked','pending-reassignment','exception','done'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      </div>}
      {error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" onClick={() => setEditor(undefined)}>取消</button><button className="primary-action" disabled={busy}>{busy?'保存中…':'保存'}</button></div>
    </form></div>}
  </main>;
}
