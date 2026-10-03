# HarborGrid · 港口集装箱堆场作业协同与闸口调度系统

React + Vite + TypeScript 前端，Node.js + Express + TypeScript 服务端。面向中型集装箱码头，把船期、箱务、堆场区块、闸口预约、设备作业和异常闭环放在同一套作业控制台中。

## 启动

```bash
npm install
npm run dev
```

前端默认 Vite 端口 5178，API 默认 `http://localhost:4107`。

## 业务能力

- 船舶航次、泊位窗口、计划/已完成翻箱和延误风险
- 箱号、尺寸、冷藏温度、危险品级别、海关状态、进出口/中转流向
- 堆场区块容量、堆存热度、冷藏插座、危险品隔离和设备可达性
- 闸口预约时隙、车道、OCR/称重/封志校验状态与同车冲突检测
- 岸桥、场桥、集卡、正面吊设备池和约束感知任务队列
- 自动堆位推荐、冷藏/危险品约束、海关查验阻塞、任务指派审计
- 设备遥测批量心跳、消息幂等、乱序/重复/延迟/过期处理与设备重连观察
- 设备健康判定：在线、心跳老化、失联、运行降级、维护、重连确认中
- 电量快速下降、位置偏离任务路线、在线但无新心跳等风险时间线
- 健康状态联动任务队列：未开始任务进入待重派，执行中任务生成必须人工确认的异常
- React 控制台支持船期驾驶舱、闸口操作、堆场热区、设备任务与遥测健康时间线

当前使用内存种子数据，领域服务通过 REST API 暴露，后续可接入 TOS、OCR、称重、RTG 遥测、预约配额和优化求解器。

## 设备遥测规则

- `POST /api/telemetry/heartbeats`：每批 1–500 条心跳，必须通过 `Idempotency-Key` 请求头或 `idempotencyKey` 字段提供批次幂等键；同一键重放返回首次处理结果。
- 每条心跳必须有唯一 `id`（消息幂等键）、`equipmentId`，可带 `at`、`seq`、`location`、`battery`、`mode`、`connectionId`。
- 心跳年龄超过 120 秒按过期拒绝；允许最多 60 秒未来时钟偏移。
- `seq` 或事件时间倒退的消息只记入时间线，不回滚状态；相同消息 ID 返回重复，不重复应用。
- 30 秒期望心跳，45 秒无新心跳为 `stale`，90 秒为 `lost-contact`。
- 失联恢复需要连续两次 45 秒内的新鲜心跳；一次延迟上报不会恢复设备。
- 风险包括 `battery-fast-drop`（≥15%/分钟）、`route-mismatch`（执行中位置与任务起终点不符）、心跳老化/失联和重连观察。
- `GET /api/telemetry/rules` 查看规则，`GET /api/telemetry/timeline` 查看健康时间线，`GET /api/telemetry/equipment/:id` 查看设备详情与受影响任务。
- `POST /api/task-exceptions/:id/confirm` 由人工选择 `continue`、`reassign` 或 `complete`；设备恢复不会自动关闭异常，也不能静默把执行中任务改为完成。
