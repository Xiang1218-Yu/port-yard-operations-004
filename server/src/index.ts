import express from 'express';
import { appointments, assignTask, blocks, confirmTaskException, containerDetail, containers, createContainer, createGateAppointment, createYardTask, dashboard, deleteContainer, deleteGateAppointment, deleteYardTask, editGateAppointment, equipmentHealthDetail, gateConflicts, ingestHeartbeatBatch, prioritizeTasks, taskExceptions, TELEMETRY_RULES, telemetryHealthOverview, telemetryTimeline, updateContainer, updateYardTask, voyages, yardHeatmap } from './domain.js';
const app = express(); app.use(express.json());
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/voyages', (_req, res) => res.json(voyages));
app.get('/api/containers', (req, res) => res.json(req.query.status ? containers.filter(c => c.status === req.query.status) : containers));
app.post('/api/containers', (req, res) => { try { res.status(201).json(createContainer(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建箱务记录失败' }); } });
app.patch('/api/containers/:id', (req, res) => { try { const result = updateContainer(req.params.id, req.body); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新箱务记录失败' }); } });
app.delete('/api/containers/:id', (req, res) => { const result = deleteContainer(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/containers/:id', (req, res) => { const result = containerDetail(req.params.id); if (!result) return res.status(404).json({ message: '箱号不存在' }); res.json(result); });
app.get('/api/yard/heatmap', (_req, res) => res.json(yardHeatmap()));
app.get('/api/yard/blocks', (_req, res) => res.json(blocks));
app.get('/api/gate/appointments', (_req, res) => res.json(appointments));
app.get('/api/gate/conflicts', (_req, res) => res.json(gateConflicts()));
app.post('/api/gate/appointments', (req, res) => { try { res.status(201).json(createGateAppointment(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '预约失败' }); } });
app.patch('/api/gate/appointments/:id', (req, res) => { try { const result = editGateAppointment(req.params.id, req.body); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新预约失败' }); } });
app.delete('/api/gate/appointments/:id', (req, res) => { const result = deleteGateAppointment(req.params.id); if (!result) return res.status(404).json({ message: '预约不存在' }); res.json({ deleted: true, id: result.id }); });
app.get('/api/equipment', (_req, res) => res.json(telemetryHealthOverview()));
app.get('/api/telemetry/rules', (_req, res) => res.json(TELEMETRY_RULES));
app.get('/api/telemetry/timeline', (req, res) => res.json(telemetryTimeline(Number(req.query.limit) || 100)));
app.get('/api/telemetry/equipment/:id', (req, res) => { const result = equipmentHealthDetail(req.params.id); if (!result) return res.status(404).json({ message: '设备不存在' }); res.json(result); });
app.post('/api/telemetry/heartbeats', (req, res) => {
  try {
    const key = String(req.header('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
    const result = ingestHeartbeatBatch(req.body?.heartbeats, key);
    const failed = result.rejected + result.rejectedExpired;
    res.status(failed === result.received && result.received > 0 ? 422 : result.applied === 0 && result.duplicated > 0 ? 200 : 202).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '心跳接入失败';
    const status = message.includes('缺少 Idempotency') ? 400 : message.includes('不能用于不同心跳批次') ? 409 : 422;
    res.status(status).json({ message });
  }
});
app.get('/api/task-exceptions', (req, res) => res.json(req.query.status ? taskExceptions.filter(item => item.status === req.query.status) : taskExceptions));
app.post('/api/task-exceptions/:id/confirm', (req, res) => {
  try {
    const action = req.body?.action;
    if (!['continue', 'reassign', 'complete'].includes(action)) return res.status(400).json({ message: 'action 必须是 continue、reassign 或 complete' });
    const result = confirmTaskException(req.params.id, action, req.body?.actor, req.body?.note);
    if (!result) return res.status(404).json({ message: '任务异常不存在' });
    res.json(result);
  } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '确认异常失败' }); }
});
app.get('/api/tasks', (_req, res) => res.json(prioritizeTasks()));
app.post('/api/tasks', (req, res) => { try { res.status(201).json(createYardTask(req.body)); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '创建作业任务失败' }); } });
app.patch('/api/tasks/:id', (req, res) => { try { const result = updateYardTask(req.params.id, req.body); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '更新作业任务失败' }); } });
app.delete('/api/tasks/:id', (req, res) => { const result = deleteYardTask(req.params.id); if (!result) return res.status(404).json({ message: '作业任务不存在' }); res.json({ deleted: true, id: result.id }); });
app.patch('/api/tasks/:id/assign', (req, res) => { try { const result = assignTask(req.params.id, req.body.equipmentId); if (!result) return res.status(404).json({ message: '任务或设备不存在' }); res.json(result); } catch (error) { res.status(409).json({ message: error instanceof Error ? error.message : '任务指派失败' }); } });
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'port-yard-operations' }));
setInterval(() => telemetryHealthOverview(), 15_000).unref();
const port = Number(process.env.PORT || 4107); app.listen(port, () => console.log(`port yard API listening on ${port}`));
