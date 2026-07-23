# Route 场景说明 — 基于 2501.17335v2 论文

> **作者**：Dev C  
> **创建时间**：2026-07-23（周四）  
> **版本**：v1.0（已冻结）

---

## 论文核心概念回顾

论文 [2501.17335v2](https://arxiv.org/abs/2501.17335)《Pandora's Box: Cross-Chain Arbitrages in the Realm of Blockchain Interoperability》揭示了两种跨链套利攻击模式：

| 模式 | 全称 | 特点 | 占比 | 中位数耗时 |
|------|------|------|------|-----------|
| **SIA** | Sequence-Independent Arbitrage | 两条链均持有库存，交易顺序无关，**无需桥接** | 67% | 10 秒 |
| **SDA** | Sequence-Dependent Arbitrage | 需要先 swap → 桥接 → 再 swap，**顺序严格依赖** | 33% | 246 秒 |

### 关键安全威胁
- **桥接延迟**（Table 4）：不同桥接方案延迟差异巨大，Scroll 原生桥接需 ~4 小时
- **高失败率**（§5.2）：头部套利者使用智能合约时，revert 率高达 93%（Polygon 链）
- **流动性集中**（§5.1）：单一地址占 32.79% 的跨链套利交易量
- **Sandwich 攻击**（§2.2）：MEV 提取者在前插/后插目标交易，劣化执行价格

---

## route-a: Healthy SIA Route (Base↔Arbitrum)

| 字段 | 值 |
|------|-----|
| `routeId` | `route-a` |
| `expectedDecision` | **ALLOW** |
| `quotedOut / expectedOut` | 998 / 1000 (偏差 **0.2%**) |
| `poolRiskScore` | **15** (低风险) |
| `historicalFailureRate` | **0.02** (2%) |
| `supportsFallback` | false |
| `warningFlags` | [] |

### 对应论文场景
- **§3.2.1 Case Study: SIA between Base and Arbitrum**
- 套利者在 Base 和 Arbitrum 均持有充足库存
- 无需桥接，两条腿交易独立完成
- 中位数完成时间 < 10 秒

### 为什么触发 ALLOW？
```
Rule A (quote_deviation): 0.2% < 0.8% 阈值 → 不计分
Rule B (failure_risk):    2% < 20% 阈值    → 不计分
Rule C (pool_risk):       15 < 70 阈值     → 不计分
Total Risk Score: 0 → ALLOW
```

### 设计意图
模拟一个**健康的跨链套利环境**——套利者库存充足、报价精准、池子深度好。这是用户希望看到的正常场景。

---

## route-b: SDA Bridge Delay Route (Ethereum→Scroll)

| 字段 | 值 |
|------|-----|
| `routeId` | `route-b` |
| `expectedDecision` | **REJECT** |
| `quotedOut / expectedOut` | 920 / 1000 (偏差 **8%**) |
| `poolRiskScore` | **90** (极高风险) |
| `historicalFailureRate` | **0.45** (45%) |
| `supportsFallback` | true |
| `fallbackRouteId` | `route-a` |
| `warningFlags` | ["high_quote_deviation", "high_failure_rate", "high_pool_risk"] |

### 对应论文场景
- **§3.2.2 Case Study: SDA between Ethereum and BSC** + **Table 4 (Scroll bridge: ~4 hours)**
- 资产需经 Scroll 原生桥接（4 小时延迟）
- 桥接期间价格大幅漂移
- 对应论文 §5.2 头部套利者 93% revert rate 的严重版本

### 为什么触发 REJECT？
```
Rule A (quote_deviation): 8% > 0.8% → min(35, 8%×500) = min(35, 40) = **35**
Rule B (failure_risk):    45%> 20% → min(30, (45%-20%)×200) = min(30, 50) = **30**
Rule C (pool_risk):       90 > 70  → 90/3 = **30**
Total Risk Score: 95 → REJECT
```

### 设计意图
模拟一个**极端危险的桥接场景**——长延迟桥接 + 高失败率 + 大报价偏差。这是 Sentinel 需要**拦截**的典型情况，防止用户资金在桥接延迟期间被市场吞噬。

---

## route-c: Moderate Pool with Sandwich Risk (Base↔Optimism)

| 字段 | 值 |
|------|-----|
| `routeId` | `route-c` |
| `expectedDecision` | **FALLBACK_TO_SAFE_ROUTE** |
| `quotedOut / expectedOut` | 960 / 1000 (偏差 **4%**) |
| `poolRiskScore` | **90** (高风险) |
| `historicalFailureRate` | **0.25** (25%) |
| `supportsFallback` | true |
| `fallbackRouteId` | `route-a` |
| `warningFlags` | ["quote_deviation", "failure_risk", "pool_risk"] |

### 对应论文场景
- **§2.2 MEV — Sandwiching Strategy**: 前置买入推高价格 → 执行用户交易 → 后置卖出获利
- **§5.1 Arbitrageur Centralization**: 头部地址控制超 30% 交易量 → 池子流动性集中 → 普通用户交易容易被收割
- SIA 策略但池子深度不足

### 为什么触发 FALLBACK？
```
Rule A (quote_deviation): 4% > 0.8% → min(35, 4%×500) = min(35, 20) = **20**
Rule B (failure_risk):    25% > 20% → min(30, (25%-20%)×200) = min(30, 10) = **10**
Rule C (pool_risk):       90 > 70  → 90/3 = **30**
Total Risk Score: 60 → 40 ≤ 60 < 70 且 supportsFallback = true → FALLBACK_TO_SAFE_ROUTE
```

### 设计意图
模拟一个**有可检测风险但不至于完全拒绝的场景**——报价偏差 4%、失败率 25%、池风险高，但存在 fallback 路由。Sentinel 的策略是**不直接拒绝**，而是提示切换到更安全的 route-a。

---

## 三 route 决策矩阵汇总

| Route | 论文对应 | 策略 | Quote偏差 | 失败率 | 池风险 | Risk Score | Decision |
|-------|---------|------|----------|--------|--------|-----------|----------|
| route-a | §3.2.1 SIA Case Study | SIA (无桥接) | 0.2% ✅ | 2% ✅ | 15 ✅ | **0** | **ALLOW** |
| route-b | §3.2.2 SDA + Table 4 Scroll | SDA (长桥接) | 8% ❌ | 45% ❌ | 90 ❌ | **95** | **REJECT** |
| route-c | §2.2 Sandwich + §5.1 集中化 | SIA (池浅) | 4% ❌ | 25% ❌ | 90 ❌ | **60** | **FALLBACK** |

### 评分阈值对照（normal profile）

| Rule | 阈值 | route-a | route-b | route-c |
|------|------|---------|---------|---------|
| Quote Deviation | > 0.8% | 0.2% (pass) | 8.0% (fail, +35) | 4.0% (fail, +20) |
| Failure Rate | > 20% | 2% (pass) | 45% (fail, +30) | 25% (fail, +10) |
| Pool Risk | > 70 | 15 (pass) | 90 (fail, +30) | 90 (fail, +30) |

---

## 设计决策记录

### 为什么 route-b 的 quote 偏差是 8% 而不是 20%？
原始设计使用 20% 偏差（quotedOut: 800），但论文 §4.1 显示跨链套利平均利润率 66.92%（收入/体积），且 CEX-DEX 套利利润率 23%-65%。20% 偏差在真实套利场景中过于极端——如果是 20% 偏差，用户根本不会选择这条路径，Sentinel 也没有展示价值。改为 8% 更能体现"bridge 延迟导致的价格漂移"，这是一个**渐进的、可检测的**风险信号。

### 为什么 route-c 的 poolRiskScore 是 90 而不是 55？
最初设计给 route-c 较低的池风险（~55），但发现这样 Rule C 不会触发，总评分仅 30 分（只有 Rule A 的 20 + Rule B 的 10），导致 decision 变成 ALLOW 而非 FALLBACK。改为 90 后，三规则全部触发，总评分 60 正好落在 FALLBACK 区间（40-70）。这也更真实——论文 §5.2 显示 Polygon 是失败率最高的链（64K+ revert），对应"池深度不足、流动性差"的直觉。

### 与前端/后端对齐的展示字段
前端 `RouteList.tsx` 已按以下顺序展示：
1. `label` — 路由名称（含论文场景标注）
2. `quotedOut / expectedOut` — 报价偏差
3. `warningFlags` — 红色 ⚠ badge
4. `poolRiskScore` — 风险评分 + 颜色指示器（红/黄/绿）

---

## 文件索引

| 文件 | 说明 |
|------|------|
| `shared/demo-data/routes.json` | 3 条 route 的正式数据（已冻结 v1） |
| `shared/types/route.ts` | Route 类型 + `createMockRoutes()` |
| `shared/types/decision.ts` | Decision 类型 + `createMockDecision()` |
| `backend/src/services/routeService.ts` | 后端路由数据读取服务 |
| `backend/src/config/risk-config.json` | 风险评分阈值配置 |
| `backend/src/services/agentService.ts` | 风险评分计算引擎 |
