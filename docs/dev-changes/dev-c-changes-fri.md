# Dev C 周五变更日志 — 2026-07-24

> **作者**：Dev C — Market Simulation / Mock Route
> **日期**：2026-07-24（周五 · Day 2）
> **版本**：v1.0

---

## 1. 端到端联调状态表

| 环节 | 接口 | route-a (ALLOW) | route-b (REJECT) | route-c (FALLBACK) | 状态 |
|------|------|-----------------|-------------------|---------------------|------|
| GET /api/quote | 获取候选 routes | ✅ 3 条返回 | ✅ 3 条返回 | ✅ 3 条返回 | PASS |
| POST /api/evaluate | Agent 风险评估 | riskScore=0, ALLOW | riskScore=95, REJECT | riskScore=60, FALLBACK | PASS |
| POST /api/execute | 链上执行（闸门） | ✅ ExecutionSuccess | ❌ ExecutionRejected | ❌ FallbackRequired | PASS |
| GET /api/events | 事件日志 | ✅ RouteEvaluated → DecisionMade → ExecutionSuccess | ✅ RouteEvaluated → DecisionMade → ExecutionRejected | ✅ RouteEvaluated → DecisionMade → FallbackTriggered | PASS |
| runFullFlow() | 完整事件链 | ✅ 3 事件 | ✅ 3 事件 | ✅ 3 事件 | PASS |

## 2. 数据流对齐检查

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `routeService.getRoutes()` 返回值匹配 `/quote` 接口定义 | ✅ PASS | 返回 `QuoteResponse` 结构完整，含 tokenIn/Out, amountIn, routes |
| `routeService.getRouteById()` 在 `execute.ts` 中被正确调用 | ✅ PASS | 用于获取 `amountIn` 和 `quotedOut` 传给 `vaultService.executeRoute()` |
| `eventService.runFullFlow()` 读取 `routes.json` 与 `routeService` 一致 | ✅ PASS | 两者均从 `shared/demo-data/routes.json` 读取，路径计算方式相同 |
| quote → evaluate → execute → events 链路中 routeId 字段一致传递 | ✅ PASS | 所有环节 routeId 均作为核心标识贯穿传递 |
| `agentService.evaluateRoute()` 对三种 profile 行为正确 | ✅ PASS | normal 配置下：route-a→ALLOW(0), route-b→REJECT(95), route-c→FALLBACK(60) |

## 3. Bug 修复记录

### 🐛 [已修复] eventService.ts — runFullFlow 中 FALLBACK 场景错误触发 executeRoute

**问题**：原代码在 `runFullFlow` 中对所有决策类型都调用 `vaultService.executeRoute()`，导致 FALLBACK 决策（route-c）产生错误的 `ExecutionRejected` 事件（因 lossBps 超限）。

**修复**：将执行逻辑改为按决策类型分支：
- `ALLOW` → 调用 `executeRoute()` 执行链上交易
- `REJECT` → 直接记录 `ExecutionRejected` 事件
- `FALLBACK_TO_SAFE_ROUTE` → 跳过执行，直接记录 `FallbackTriggered` 事件

**影响文件**：`backend/src/services/eventService.ts`
**影响范围**：runFullFlow 事件链完整性（直接影响 T3 fallback 链路验证）

## 4. routes.json 编码问题记录

**发现**：`shared/demo-data/routes.json` 中 `notes` 字段存在多字节字符编码问题（中文 + emoji 混合导致读取时出现乱码）。这不影响 API 返回（JSON 解析正确），但在终端直接 `cat` 时会显示异常。

**影响**：
- 不影响功能：routes.json 使用 UTF-8 编码，Node.js 读取正常
- 仅影响人工调试时的可读性

**建议**：后续将 `notes` 中的 emoji 替换为纯文本标注，或确保编辑器/终端支持 UTF-8。

## 5. 录屏 demo 数据

| Route | riskScore | Decision | 录屏安全性 | 说明 |
|-------|-----------|----------|-----------|------|
| route-a | 0 | ALLOW | ✅ 极安全 | 所有指标远低于阈值 |
| route-b | 95 | REJECT | ✅ 极安全 | 所有指标远超阈值 |
| route-c | 60 | FALLBACK | ✅ 极安全 | 三规则均明确触发 |

**结论**：当前 `routes.json` 已足够保守，无需新建 `demo-routes.json`。三条 route 的 riskScore 与阈值之间有充足缓冲区（0/60/95 vs 阈值 40/70），即使在不同 profile 配置下也不会出现决策翻转。

## 6. 周五验收标准自查

- [x] 3 条 route 的正式样本能流经完整链路（quote → evaluate → execute）
- [x] `/execute` 至少能跑通 1 次（route-a ALLOW 路径，txHash 已返回）
- [x] 三种 route 至少 2 种决策已稳定出现（ALLOW + REJECT + FALLBACK 全部 3 种）
- [x] fallback 链路数据完整传递（fallbackRouteId 字段正确，FallbackTriggered 事件包含目标 routeId）
- [x] 录屏 demo route 数据已准备（当前 routes.json 满足要求）
