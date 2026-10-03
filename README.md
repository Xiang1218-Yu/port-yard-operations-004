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
- 设备遥测接入：批量心跳、幂等去重、乱序/过期处理、失联与电量/偏航风险判定
- 健康状态联动任务队列：失联设备未开始任务转待重派，执行中任务生成人工确认异常
- 自动堆位推荐、冷藏/危险品约束、海关查验阻塞、任务指派审计
- React 控制台支持船期驾驶舱、闸口操作、堆场热区、设备健康时间线与设备任务操作

## 遥测接口约定

- `POST /api/telemetry/heartbeats`：批量心跳，必须携带幂等键 `batchId`，每条读数携带唯一 `messageId`；重复批次/消息幂等返回，不会重复应用
- 过期规则：`recordedAt` 早于 10 分钟拒收（`expired`），晚到但在有效期内的旧读数只补历史、不刷新存活时间——延迟上报不会被当成设备恢复，恢复必须依赖新鲜心跳
- `GET /api/telemetry/overview|timeline|exceptions|affected-tasks|rules`：健康总览、状态迁移时间线、待确认异常、受影响任务与判定阈值
- `POST /api/telemetry/exceptions/:id/resolve`：人工处置执行中任务异常（`resume` 恢复执行 / `reassign` 转待重派 / `complete` 确认完成），任务不会被静默改成已完成

当前使用内存种子数据，领域服务通过 REST API 暴露，后续可接入 TOS、OCR、称重、RTG 遥测、预约配额和优化求解器。
