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

### 仅前后端 Demo（无需 Anvil）

在 PowerShell 中显式开启 mock chain 模式后启动后端：

```powershell
cd backend
$env:CHAIN_MODE = "mock"
npm run dev
```

另开一个终端启动前端：

```powershell
cd frontend
npm run dev
```

mock 模式下 `/api/execute/nonce` 和 `/api/execute` 不访问 RPC，仅用于本地
前后端 Demo。未设置 `CHAIN_MODE=mock` 时，后端保持真实 RPC 行为。

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

# ABI 输出
# → contracts/abi/VaultExecution.json

# 集成测试数据
# → contracts/integration/execution-permit.json
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
│   ├── src/Counter.sol           # 测试合约
│   ├── script/DeployVaultExecution.s.sol  # 部署脚本
│   ├── test/                     # 5 个测试文件（17 tests pass）
│   ├── abi/                      # 编译后 ABI 输出
│   │   └── VaultExecution.json
│   ├── broadcast/                # 部署记录
│   └── integration/              # 集成测试数据
│       └── execution-permit.json
├── backend/             # Express API 服务 (TypeScript)
│   ├── src/index.ts               # 入口
│   ├── src/routes/                # 4 个 API 路由 (quote/evaluate/execute/events)
│   ├── src/services/              # route/agent/vault/event 服务
│   ├── src/config/risk-config.json  # 风险配置
│   └── dist/                      # 编译输出
├── frontend/            # React + Vite Demo App
│   ├── src/App.tsx              # 主页面（含完整交互逻辑）
│   ├── src/components/          # UI 组件
│   ├── src/services/            # API 请求封装
│   ├── src/types/               # 前端类型定义
│   ├── src/pages/               # 页面组件
│   ├── src/contexts/            # React Context
│   └── dist/                    # 生产构建输出
├── shared/              # 全队共享
│   ├── types/                   # Route/Decision/Event 类型 + index.ts
│   │   ├── route.ts
│   │   ├── decision.ts
│   │   ├── event.ts
│   │   └── index.ts
│   └── demo-data/               # Mock 数据
│       ├── routes.json          # 3 条核心路由
│       └── demo-routes.json     # 录屏专用 demo 数据（含 profile 约束说明）
└── docs/
    ├── architecture.md
    ├── api-contract.md
    ├── demo-script.md
    ├── route-scenarios.md       # 场景说明（基于论文 2501.17335v2）
    └── dev-changes/             # 每日变更记录
        ├── dev-c-changes-thu.md
        ├── dev-c-changes-fri.md
        ├── dev-d-changes-07-23.md
        └── dev-a-changes-thu.md
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
- **Dev C**: routes.json + demo-routes.json + mock 数据 + 场景说明
- **Dev D**: backend 服务 + 4 个 API + 事件管理
- **Dev E**: evaluateRoute() Agent 规则引擎
- **前端**: Demo App 页面 + 状态展示
- **设计**: Demo 页面结构 + 风险状态视觉规范
- **运营**: Demo Script + README

## 技术栈

- **合约**: Solidity 0.8.24 + Foundry
- **后端**: Node.js + Express + TypeScript
- **前端**: React + Vite + TypeScript + Wagmi + Ethers
- **链**: Anvil (本地 Ethereum 兼容链)
- **参考论文**: 2501.17335v2 — *Pandora's Box: Cross-Chain Arbitrages in the Realm of Blockchain Interoperability*

