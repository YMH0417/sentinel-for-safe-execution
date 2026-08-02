# Route 场景说明

> **Last updated**: 2026-07-31  
> **Part I** — Legacy mock routes (`route-a/b/c`, mock mode)  
> **Part II** — Demo chain routes (**48** on-chain routes, demo mode)

---

# Part I — Legacy Mock Routes (mock mode)

> 数据文件：`shared/demo-data/routes.json`（v1.0 冻结）  
> 论文背景：[2501.17335v2](https://arxiv.org/abs/2501.17335)

## 论文核心概念

| 模式 | 全称 | 特点 |
|------|------|------|
| **SIA** | Sequence-Independent Arbitrage | 两链均有库存，无需桥接 |
| **SDA** | Sequence-Dependent Arbitrage | 需桥接，顺序依赖，延迟敏感 |

---

## route-a: Healthy SIA Route

| 字段 | 值 |
|------|-----|
| routeId | `route-a` |
| expectedDecision | **ALLOW** (riskScore 0) |
| quotedOut / expectedOut | 998 / 1000 (0.2%) |
| poolRiskScore | 15 |
| historicalFailureRate | 0.02 |

对应论文 §3.2.1 SIA case study — 健康跨链套利环境。

---

## route-b: SDA Bridge Delay Route

| 字段 | 值 |
|------|-----|
| routeId | `route-b` |
| expectedDecision | **REJECT** (riskScore 95) |
| quotedOut / expectedOut | 920 / 1000 (8%) |
| poolRiskScore | 90 |
| historicalFailureRate | 0.45 |
| fallbackRouteId | `route-a` |

对应论文 §3.2.2 SDA + Scroll 桥延迟 — Sentinel 应拦截的极端场景。

---

## route-c: Moderate Pool / Sandwich Risk

| 字段 | 值 |
|------|-----|
| routeId | `route-c` |
| expectedDecision | **FALLBACK_TO_SAFE_ROUTE** (riskScore 60) |
| quotedOut / expectedOut | 960 / 1000 (4%) |
| fallbackRouteId | `route-a` |

对应论文 §2.2 MEV sandwich — 有可检测风险但存在 fallback。

---

## Mock 决策矩阵

| Route | Quote偏差 | 失败率 | 池风险 | Score | Decision |
|-------|----------|--------|--------|-------|----------|
| route-a | 0.2% | 2% | 15 | 0 | ALLOW |
| route-b | 8% | 45% | 90 | 95 | REJECT |
| route-c | 4% | 25% | 90 | 60 | FALLBACK |

---

# Part II — Demo Chain Routes (demo mode)

## 场景设计

| 维度 | 设计 |
|------|------|
| 代币 | USDC, GOOD, BAD, BAIT |
| 公允价格比 | USDC : GOOD : BAD : BAIT = **1 : 20 : 100 : 1** |
| 定向币对 | 4×3 = **12 pairs**（不含同币互换） |
| 池档位 | SAFE / SHALLOW / TOXIC / **SDA** × 每币对 = **48 routes** |
| 报价来源 | 链上 `DemoPair.getReserves()` + Uniswap V2 `getAmountOut` |
| 参考价 | 同币对 SAFE 池 spot price → `expectedOut` |
| Fallback | SHALLOW / TOXIC → 同币对 `route-{in}-{out}-safe` |

### 路由命名

```text
route-{tokenIn}-{tokenOut}-{pool}

示例：
  route-usdc-good-safe
  route-good-bad-toxic
  route-bait-usdc-shallow
```

`tokenIn` / `tokenOut` ∈ {usdc, good, bad, bait}  
`pool` ∈ {safe, shallow, toxic, **sda**}

示例：`route-usdc-good-sda`

---

## 池档位元数据（Agent 评分输入）

| 池 | failureRate | basePoolRisk | supportsFallback | 链上特征 |
|----|-------------|--------------|------------------|----------|
| SAFE | 0.02 | 12 | false | 深流动性，接近公允价 |
| SHALLOW | 0.25 | 55 | true | 浅池，高 price impact |
| TOXIC | 0.35 | 88 | true | 恶意报价倾向，flag `toxic_pool` |
| SDA | 0.45 | 90 | true | 深池（同 SAFE），**执行窗口风险**（类比跨链桥延迟） |

`poolRiskScore` = base + price impact 修正（见 `chainQuoteService.ts`）。

---

## 代币风险（Registry 硬规则）

| 代币 | registry riskTag | tokenOut 时 Agent 行为 |
|------|------------------|------------------------|
| USDC | NONE (0) | 仅走三规则评分 |
| GOOD | NONE (0) | 仅走三规则评分 |
| BAD | HIGH (1) | **无条件 REJECT**, score=100 |
| BAIT | BAIT (2) | **无条件 REJECT**, score=100 |

> 即使 SAFE 池报价正常，`route-usdc-bad-safe` 仍 REJECT。Safe swap 无法执行；开发验证用 `POST /api/swap/force`。

---

## Safe Swap 行为（`POST /api/swap` / `/safe`）

| 场景 | Agent 决策 | 实际执行 |
|------|-----------|----------|
| `route-usdc-good-safe` | ALLOW | 原路由 |
| `route-usdc-good-toxic` | REJECT | 422，不 swap |
| `route-usdc-bad-safe` | REJECT | 422，不 swap |
| `route-usdc-good-sda` | **REJECT** | 422，不 swap（SDA 执行窗口） |
| `route-usdc-good-shallow`（amount 100） | FALLBACK | 同币对 `route-usdc-good-safe` |

Safe 模式**不启用滑点带宽**（`minOut=0`）；路由策略完全由 Agent 决定。

执行模式：配置了 DemoSwapRouter 时 `executionMode: "router"`（1 tx）；否则 `"direct"`（3 tx）。

---

## Unsafe / Force Swap（`POST /api/swap/force`）

| 场景 | Agent | 滑点（默认 100 bps） | 结果 |
|------|-------|----------------------|------|
| `route-usdc-good-safe` | 绕过 | — | 成功 |
| `route-usdc-good-sda` | 绕过 | 报价≈SAFE | **成功**（对比 Safe 下 REJECT） |
| `route-usdc-good-toxic` | 绕过 | 报价高于上限 | **QUOTE_DEVIATION_EXCEEDED** |
| `route-usdc-good-shallow`（amount 100） | 绕过 | 报价低于下限 | **SLIPPAGE_EXCEEDED** |
| `route-usdc-bad-safe` | 绕过 | — | 可成功（无 tokenOut 硬规则） |

滑点参考价：同币对 **SAFE 池** `expectedOut`；带宽 `[expectedOut × (1−bps), expectedOut × (1+bps)]`。

前端 Unsafe 模式在 MetaMask 前做同等预检（`frontend/src/lib/slippage.ts`）。

---

## 前端 Safe / Unsafe 切换（`/transaction`）

| 模式 | UI | 行为 |
|------|-----|------|
| **Safe** | Agent 面板 +「风险评估」 | 必须先 evaluate；REJECT / FALLBACK 拦截执行 |
| **Unsafe** | 滑点控件 +「Unsafe 执行保护」说明 | 「风险评估」禁用；直连 `/swap/force` |

切换模式时清空 stale Agent 决策，避免 Unsafe 下误显示旧 REJECT/ALLOW。

---

## 典型 evaluate 示例（normal profile）

| routeId | 预期 | 原因 |
|---------|------|------|
| `route-usdc-good-safe` | ALLOW | 低偏差、SAFE 池 |
| `route-usdc-good-toxic` | REJECT | 高 pool risk + toxic flags |
| `route-usdc-good-sda` | **REJECT** | SDA 执行窗口风险 |
| `route-usdc-bad-safe` | REJECT | tokenOut=BAD 硬规则 |
| `route-good-bait-shallow` | REJECT | tokenOut=BAIT 硬规则 |
| `route-bad-usdc-safe` | ALLOW* | BAD 作 tokenIn 允许；*仅评分规则 |

---

## 48 路由完整列表

每定向币对含 4 池：**safe / shallow / toxic / sda**。

### USDC → *

| routeId 后缀 | tokenOut |
|--------------|----------|
| `-good-safe / -shallow / -toxic / -sda` | GOOD |
| `-bad-safe / -shallow / -toxic / -sda` | BAD |
| `-bait-safe / -shallow / -toxic / -sda` | BAIT |

### GOOD / BAD / BAIT → *

同理 12 定向 × 4 池 = **48**。完整 pair 地址：`GET /api/demo/pools`。

---

## Swap 验证

| 验证方式 | 命令 / 预期 |
|----------|-------------|
| 一键启动 + 验证 | `.\start-demo.ps1 -VerifySwaps` |
| Backend API (force) | `POST /api/swap/verify-all` → **36 通过 + 12 TOXIC 滑点失败** |
| Backend API (safe) | `POST /api/swap/verify-all` `{"safe":true}` → BAD/BAIT/SDA 等大量 REJECT |
| Foundry test | `forge test --match-contract SwapAll36Routes` → **48/48** 直连 swap |

---

## 文件索引

| 文件 | 说明 |
|------|------|
| `shared/demo-data/routes.json` | Legacy mock（3 条） |
| `backend/src/config/demoRoutes.ts` | 48 路由命名 / 解析 / routeId bytes32 |
| `backend/src/services/chainQuoteService.ts` | 链上报价 + SDA/TOXIC 元数据 |
| `backend/src/services/agentService.ts` | 评分 + BAD/BAIT/SDA 硬拒绝 |
| `backend/src/services/swapService.ts` | safe（无滑点）/ force（滑点）swap |
| `frontend/src/components/TransactionPage.tsx` | Safe/Unsafe 执行流程 |
| `frontend/src/lib/slippage.ts` | Unsafe 滑点预检 |
| `contracts/src/demo/DemoScenarioDeployer.sol` | 48 池部署 |
| `contracts/deployments/anvil-31337-demo.json` | 部署 manifest（自动生成） |
| `scripts/start-demo.ps1` | Windows 一键启动 |
