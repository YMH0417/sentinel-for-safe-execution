# Sentinel for Safe Execution — Week 3 MVP

**Execution Safety** — 在交易真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route。

## 核心闭环

```
前端输入 swap → Router 返回候选 route → Safety Agent 风险评估 →
系统输出 ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE → Vault Execution 执行
```

## 快速启动（3 个终端）

### 环境要求
- Node.js >= 18
- Foundry (forge, anvil, cast)
- npm

### 终端 1 — Anvil 本地链

```bash
cd contracts
export PATH="$HOME/.foundry/bin:$PATH"
anvil
```

> 监听 `127.0.0.1:8545`，保持运行。

### 终端 2 — 后端 API

```bash
cd backend
npm run dev
```

> 监听 `127.0.0.1:8080`

### 终端 3 — 前端 Demo

```bash
cd frontend
npm run dev
```

> 监听 `127.0.0.1:8081`，通过 Vite proxy 自动转发 `/api` 到后端

### 验证

```bash
# 后端健康检查
curl http://127.0.0.1:8080/api/health
# → {"status":"ok","service":"sentinel-backend","version":"0.1.0"}

# 前端代理测试
curl http://127.0.0.1:8081/api/health
# → 同上（Vite proxy 转发）

# 测试三条 route 决策
curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" -d '{"routeId":"route-a"}'
# → ALLOW (riskScore: 0)

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" -d '{"routeId":"route-b"}'
# → REJECT (riskScore: 95)

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" -d '{"routeId":"route-c"}'
# → FALLBACK_TO_SAFE_ROUTE (riskScore: 60)

# 执行
curl -X POST http://127.0.0.1:8080/api/execute \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-a","maxLossBps":100,"deadline":1721660000}'
# → {"success":true,"event":{...}}
```

浏览器访问 http://127.0.0.1:8081 打开 Demo 页面。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/quote?tokenIn=USDT&tokenOut=USDC&amount=1000` | 获取候选 routes |
| `POST` | `/api/evaluate` | `{ routeId, configProfile }` — Agent 风险评估 |
| `POST` | `/api/execute` | `{ routeId, maxLossBps, deadline }` — 链上执行 |
| `GET` | `/api/events` | 查询事件日志 |

## 合约

```bash
cd contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge build
forge test          # 17 tests pass

# 部署到 Anvil
forge script script/DeployVaultExecution.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow
```

## 生产构建

```bash
cd backend
npm run build    # tsc + JSON 文件复制
node dist/index.js

cd frontend
npm run build
```

## 三条核心 Route（MVP 演示）

| Route | 预期 Decision | 说明 |
|-------|-------------|------|
| route-a | ALLOW | 低风险，报价接近预期（SIA 健康场景） |
| route-b | REJECT | 高风险，报价偏差大，失败率高（SDA 桥接延迟场景） |
| route-c | FALLBACK_TO_SAFE_ROUTE | 中等风险，有 fallback（Sandwich/集中化预警场景） |

## 风险规则引擎

- **Rule A (Quote Deviation)**: `|quotedOut - expectedOut| / expectedOut > 0.008` → 标记 `quote_deviation`
- **Rule B (Failure Risk)**: `historicalFailureRate > 0.20` → 标记 `failure_risk`
- **Rule C (Pool Risk)**: `poolRiskScore > 70` → 标记 `pool_risk`

**决策阈值**:
- riskScore < 40 → `ALLOW`
- 40 <= riskScore < 70 & supportsFallback → `FALLBACK_TO_SAFE_ROUTE`
- riskScore >= 70 → `REJECT`

## 项目结构

```
project/
├── contracts/           # Foundry 智能合约
│   ├── src/VaultExecution.sol    # 闸门校验合约
│   ├── script/DeployVaultExecution.s.sol  # 部署脚本
│   └── test/                        # 17 个测试
├── backend/             # Express API 服务 (TypeScript)
│   ├── src/routes/              # 4 个 API 路由
│   ├── src/services/            # route/agent/vault/event 服务
│   └── src/config/risk-config.json  # 风险配置
├── frontend/            # React + Vite Demo App
│   ├── src/components/          # 6 个 UI 组件
│   └── src/App.tsx              # 主页面（含完整交互逻辑）
├── shared/              # 全队共享
│   ├── types/                   # Route/Decision/Event 类型
│   └── demo-data/routes.json    # 3 条核心路由
└── docs/
    ├── architecture.md
    ├── api-contract.md
    └── demo-script.md
```

## 端口说明

| 服务 | 端口 |
|------|------|
| Anvil | 8545 |
| Backend | 8080 |
| Frontend | 8081 |

> ⚠️ 注意：Windows 上 3000-3005 端口被系统阻止（EACCES），所以默认使用 8080/8081。

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
