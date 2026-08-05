# Dashboard「交易情况概览」— 计算说明（内部）

> **Last updated**: 2026-08-05  
> **Audience**: 开发 / 产品 / QA（**非**用户弹窗文案）  
> **实现**: `frontend/src/api/client.ts` — `computeSecurityScore`、`computeScoreLegend`、`computeLegendBreakdown`

用户可见说明见 Dashboard 卡片 ⓘ 弹窗；本文档记录精确规则，便于对齐前后端与后续链上数据迁移。

---

## 数据来源

| 输入 | API | 说明 |
|------|-----|------|
| 事件流 | `GET /api/events` | Backend 内存事件日志，**全站汇总**，未按钱包过滤 |

计算在 **浏览器端**完成；非链上数据（见 [`../tmp/todo.md`](../tmp/todo.md) 链上迁移待办）。

---

## 圆环综合得分（0–100）

函数：`computeSecurityScore(events)`

### 步骤

1. **基准分** `85`
2. 取最近 **20 条**事件，逐条扣分：
   - `eventType` 含 `Reject`，或 `eventType === "SwapFailed"`：**−8** / 条
   - `decision === "FALLBACK_TO_SAFE_ROUTE"`：**−3** / 条（可与上条同条事件叠加）
3. 限制在 `[0, 100]`

### 圆环颜色（`SecurityGauge.tsx`）

| 分数 | 颜色 |
|------|------|
| ≥ 70 | 青 |
| ≥ 40 | 黄 |
| &lt; 40 | 红 |

---

## 下方三格占比（%）

函数：`computeScoreLegend` → 内部 `computeLegendBreakdown`

三格 **不必相加为 100%**；`normal` 事件只进入分母，稀释三项占比。

### 事件窗口

最近 **100 条**事件（`LEGEND_EVENT_WINDOW = 100`；不足 100 条时用实际条数）。

### 单条事件归类（互斥，优先级从高到低）

| 桶 | 条件 |
|----|------|
| **highRisk** | `decision === "REJECT"`，或 `eventType` 含 `Reject`，或 `eventType === "SwapFailed"` |
| **strategy** | `decision === "FALLBACK_TO_SAFE_ROUTE"`，或 `eventType` 含 `Fallback` |
| **warning** | `eventType` 含 `Warn`，或 `decision === "ALLOW"` 且 `riskScore ≥ 40` |
| **normal** | 其余（含低风险 ALLOW、成功 swap 等） |

每条事件只计入一个桶；`normal` 只进入分母，不进入任一格子分子。

### 质量与分母

```
highRiskMass  = highRiskEvents
strategyMass  = strategyEvents
warningMass   = warningEvents

totalActivity = max(recent.length, 1)
```

### 显示百分比

```
highRisk%  = round(clamp(highRiskMass  / totalActivity × 100, 0, 100))
strategy%  = round(clamp(strategyMass  / totalActivity × 100, 0, 100))
warning%   = round(clamp(warningMass   / totalActivity × 100, 0, 100))
```

### 示例

最近 100 条：2 次拒单、1 次 fallback、97 次 normal。

```
totalActivity = 100
highRisk%     = round(2/100 × 100) = 2%
strategy%     = round(1/100 × 100) = 1%
```

---

## 与圆环分数的关系

| 项 | 窗口 | 用途 |
|----|------|------|
| 圆环 | 最近 20 条事件 | 单一 0–100 分 |
| 三格 | 最近 100 条事件 | 三类占比，独立算法 |

两者 **不同算法**，不要假设数值一一对应。

---

## 侧栏用户统计（与圆环/三格不同源）

Dashboard **左栏** 有两项在连接 MetaMask 后 **按当前钱包地址** 过滤 events / ledger，与上方圆环、三格（平台全量 events）独立：

| 侧栏项 | 过滤 | 未连接钱包 |
|--------|------|------------|
| **交易失败数** | `computeUserStats(events, account)` — 仅统计 `context.account === 连接地址` 的 reject 类事件 | 显示 0，附「连接钱包后显示您的失败数」类提示 |
| **AI 最近一笔交易** | `findLatestTradeEvent(events, account)` — 无匹配则不请求 trade 解读 API | 空闲文案提示连接钱包 |

切换账户时会重置 AI 解读状态，避免展示上一地址的结果。

---

## 链条状态（Dashboard 中栏）

**数据来源**：账本聚合 `GET /api/debug/pool-volume`（**非**前端 RPC）。

- Backend 从 trade ledger 读取最近 **100 笔**成交
- 按池标签（SAFE / SHALLOW / TOXIC / SDA）汇总 **USDC 名义成交量**
- 60s 内存缓存；`POST /api/debug/warm-cache` 可预热
- 前端 **↻ 刷新** 只拉 backend 缓存

实现：`backend/src/services/poolVolumeService.ts`、`poolVolumeCacheService.ts`

### 变更

| 日期 | 变更 |
|------|------|
| 2026-08-05 | 移除 pools-health；链条状态改读 ledger pool-volume |
| 2026-08-05 | 评分改为链上成交量；Backend 60s 索引；移除决策小格 |

---

## 调试

浏览器控制台可对当前页数据调用（需已加载 events / pools）：

```javascript
// 在 Dashboard 路由下，从 React 状态或重新 fetch /api/events 后手动验证
```

或阅读 `explainSecurityMetrics()` 返回的 `legendRaw`（开发用，UI 未暴露）。

---

## 变更记录

| 日期 | 变更 |
|------|------|
| 2026-08-05 | 移除运行分析 Tab；评分/三格改为纯 events；移除 pools-health |
| 2026-08-05 | 链条状态：四行可执行性均分 + 异常占比独立展示；移除决策小格 |
| 2026-08-05 | 三格分母改为「总体活动量」；事件窗口 30 → 100；用户弹窗与内部分离 |
| 2026-08-05 | 侧栏失败数与 AI 最近交易改为连接钱包后按账户过滤 |

## 相关

- [`api-contract.md`](api-contract.md) — `/api/events`、`/api/debug/pool-volume`
- [`../tmp/todo.md`](../tmp/todo.md) — 链上真实数据迁移
