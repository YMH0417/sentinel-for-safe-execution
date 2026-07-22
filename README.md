# Sentinel for Safe Execution — Week 3 MVP

**Execution Safety** — 在交易真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route。

## 核心闭环

```
前端输入 swap → Router 返回候选 route → Safety Agent 风险评估 →
系统输出 ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE → Vault Execution 执行
```

## 项目结构

```
project/
├── frontend/          ← React + Vite Demo App（端口 3000）
├── backend/           ← Express Orchestration Service（端口 3001）
├── contracts/         ← Foundry VaultExecution 合约（anvil 本地链）
├── shared/            ← 全队共享类型 & 数据
│   ├── types/         ← Route / Decision / Event 类型定义
│   └── demo-data/     ← routes.json（3 条核心 route）
└── docs/              ← 架构 & API & Demo 文档
```

## 快速启动

### 0. 环境要求
- Node.js >= 18
- Foundry (forge, anvil, cast)
- npm

### 1. 合约
```bash
cd contracts
forge install
forge build
forge test          # 17 tests pass
anvil               # 启动本地链（另一个终端）
forge script script/DeployVaultExecution.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 2. 后端
```bash
cd backend
npm install
npm run dev         # → http://localhost:3001
```

**API 端点：**
- `GET  /api/quote?tokenIn=USDT&tokenOut=USDC&amount=1000` — 获取候选 routes
- `POST /api/evaluate` — `{ "routeId": "route-b", "configProfile": "normal" }` — Agent 风险评估
- `POST /api/execute` — `{ "routeId": "route-a", "maxLossBps": 100, "deadline": 1721659999 }` — 链上执行
- `GET  /api/events` — 查询事件日志

### 3. 前端
```bash
cd frontend
npm install
npm run dev         # → http://localhost:3000
```

## 三条核心 Route（MVP 演示）

| Route | 预期 Decision | 说明 |
|-------|-------------|------|
| route-a | ALLOW | 低风险，报价接近预期 |
| route-b | REJECT | 高风险，报价偏差大，失败率高 |
| route-c | FALLBACK_TO_SAFE_ROUTE | 中等风险，有 fallback |

## 风险规则引擎

- **Rule A (Quote Deviation)**: `|quotedOut - expectedOut| / expectedOut > 0.008` → 标记 quote_deviation
- **Rule B (Failure Risk)**: `historicalFailureRate > 0.20` → 标记 failure_risk
- **Rule C (Pool Risk)**: `poolRiskScore > 70` → 标记 pool_risk

**决策阈值**:
- riskScore < 40 → ALLOW
- 40 <= riskScore < 70 & supportsFallback → FALLBACK_TO_SAFE_ROUTE
- riskScore >= 70 → REJECT

## 团队分工

- **Dev A**: VaultExecution 合约 + 部署脚本
- **Dev B**: risk-config.json + 阈值管理
- **Dev C**: routes.json + mock 数据
- **Dev D**: backend 服务 + 4 个 API + 事件管理
- **Dev E**: evaluateRoute() Agent 规则引擎
- **前端**: Demo App 页面 + 状态展示
- **设计**: Demo 页面结构 + 风险状态视觉规范
- **运营**: Demo Script + README

## 技术栈

- **合约**: Solidity 0.8.24 + Foundry
- **后端**: Node.js + Express + TypeScript
- **前端**: React + Vite + TypeScript
- **链**: Anvil (本地 Ethereum 兼容链)
