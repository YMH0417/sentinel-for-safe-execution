# Sentinel for Safe Execution — 快速启动指南

> 环境：Windows + Git Bash (MINGW64)
> Node.js v24.15 + Foundry v1.7.1

## 启动顺序（3 步）

```bash
cd e:/sentinel-for-safe-execution
```

### 1. 启动本地链（Anvil）

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts
anvil
```

保持这个终端窗口运行。Anvil 默认监听 `127.0.0.1:8545`。

### 2. 启动后端 API

打开**第二个**终端：

```bash
cd e:/sentinel-for-safe-execution/backend
npm run dev
```

后端监听 `127.0.0.1:8080`，提供 4 个 API：
- `GET  /api/health` — 健康检查
- `GET  /api/quote?tokenIn=USDT&tokenOut=USDC&amount=1000` — 获取候选路由
- `POST /api/evaluate` — Agent 风险评估
- `POST /api/execute` — 链上执行
- `GET  /api/events` — 查询事件日志

### 3. 启动前端 Demo

打开**第三个**终端：

```bash
cd e:/sentinel-for-safe-execution/frontend
npm run dev
```

前端监听 `127.0.0.1:8081`，通过 Vite proxy 自动转发 `/api/*` 到后端。

## 验证

三个终端都正常后：

```bash
# 后端健康检查
curl http://127.0.0.1:8080/api/health
# → {"status":"ok","service":"sentinel-backend","version":"0.1.0"}

# 前端代理测试
curl http://127.0.0.1:8081/api/health
# → 同上（通过 Vite proxy 转发）

# 测试三条 route 决策
curl -X POST http://127.0.0.1:8080/api/evaluate -H "Content-Type: application/json" -d '{"routeId":"route-a"}'
# → ALLOW (riskScore: 0)

curl -X POST http://127.0.0.1:8080/api/evaluate -H "Content-Type: application/json" -d '{"routeId":"route-b"}'
# → REJECT (riskScore: 93)

curl -X POST http://127.0.0.1:8080/api/evaluate -H "Content-Type: application/json" -d '{"routeId":"route-c"}'
# → FALLBACK_TO_SAFE_ROUTE (riskScore: 55)
```

浏览器访问 http://127.0.0.1:8081 打开 Demo 页面。

## 合约测试

```bash
cd e:/sentinel-for-safe-execution/contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge build    # 编译
forge test     # 17 tests pass
```

## 部署合约到 Anvil（可选，演示用）

```bash
cd e:/sentinel-for-safe-execution/contracts
export PATH="$HOME/.foundry/bin:$PATH"
forge script script/DeployVaultExecution.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast --slow
```

合约地址会打印在日志中，后端 `vaultService.ts` 可替换为真实 cast 调用。

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| Anvil | 8545 | 本地 Ethereum 兼容链 |
| Backend | 8080 | Express API 服务 |
| Frontend | 8081 | Vite 开发服务器 |

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
