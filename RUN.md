# Sentinel for Safe Execution — 启动指南

> 环境：Windows + Git Bash (MINGW64)
> Node.js v24.15 + Foundry v1.7.1

## 环境要求

- Node.js >= 18
- Foundry (forge, anvil, cast)
- npm

## 一键启动（3 个终端）

### 终端 1 — Anvil 本地链

```bash
cd e:/sentinel-for-safe-execution
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts
anvil
```

> 监听 `127.0.0.1:8545`，保持运行。

### 终端 2 — 后端 API

```bash
cd e:/sentinel-for-safe-execution/backend
npm run dev
```

> 监听 `127.0.0.1:8080`

### 终端 3 — 前端 Demo

```bash
cd e:/sentinel-for-safe-execution/frontend
npm run dev
```

> 监听 `127.0.0.1:8081`，自动代理 `/api` 到后端

## 验证

### 全链路测试

```bash
# Health check
curl http://127.0.0.1:8080/api/health

# 三条 route 的决策
curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-a"}'
# → ALLOW (riskScore: 0)

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-b"}'
# → REJECT (riskScore: 93)

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-c"}'
# → FALLBACK_TO_SAFE_ROUTE (riskScore: 55)

# 执行
curl -X POST http://127.0.0.1:8080/api/execute \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-a","maxLossBps":100,"deadline":1721660000}'
# → {"success":true,"event":{...}}
```

### 前端 Demo

浏览器访问 http://127.0.0.1:8081

## 合约测试

```bash
cd e:/sentinel-for-safe-execution/contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge build
forge test
```

> 17 tests pass (4 safety + 8 normal + 3 rejection + 2 fuzz)

## 部署合约到 Anvil

```bash
cd e:/sentinel-for-safe-execution/contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge script script/DeployVaultExecution.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow
```

## 生产构建

```bash
cd e:/sentinel-for-safe-execution/backend
npm run build
node dist/index.js
```

## 端口说明

| 服务 | 端口 |
|------|------|
| Anvil | 8545 |
| Backend | 8080 |
| Frontend | 8081 |

> ⚠️ 注意：Windows 上 3000-3005 端口被系统阻止（EACCES），
> 所以默认使用 8080/8081。如需用其他端口，修改对应配置即可。

## 目录结构

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
