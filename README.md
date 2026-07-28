# Sentinel for Safe Execution

**Execution Safety** — 在 swap 真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route。

本项目包含两层保护：**Agent 软规则**（报价偏差、失败率、池风险、代币风险标签）+ **Vault 合约硬约束**（maxLossBps、deadline、pause、EIP-712 签名）。Demo 阶段提供 **36 条真实链上 swap 路由**，用于验证报价、评估与执行闭环。

---

## 核心闭环

```
用户输入 swap 参数
    → Quote Service 返回候选 routes（demo 模式读链上储备）
    → Safety Agent 规则评估（ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE）
    → 执行层
        · POST /api/swap/safe — evaluate + fallback + 滑点保护 + 链上 swap
        · DemoSwapRouter（可选）— Vault 闸门 + swap 同一笔 tx
        · POST /api/execute — 独立 Vault 闸门（EIP-712，不直接调 DEX）
    → Event 日志（JSONL 持久化 + 内存查询）
```

---

## Demo 场景概览

| 项目 | 说明 |
|------|------|
| 代币 | USDC、GOOD、BAD、BAIT |
| 价格比例 | USDC : GOOD : BAD : BAIT = **1 : 20 : 100 : 1** |
| 池类型 | SAFE / SHALLOW / TOXIC（各 3 档） |
| 定向币对 | 4 代币两两可交易 → **12 币对 × 3 池 = 36 路由** |
| 路由命名 | `route-{tokenIn}-{tokenOut}-{pool}`，如 `route-usdc-good-safe` |
| 链上合约 | `DemoPair`、`DemoPoolRegistry`、`DemoScenarioDeployer`、`DemoSwapRouter` |
| 闸门合约 | `VaultExecution.sol`（EIP-712 permit） |

Legacy mock 三条 route（`route-a/b/c`）仍可用于 **mock 模式** 快速联调 Agent。

---

## 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | backend / frontend |
| npm | 随 Node | 依赖安装 |
| Foundry | 推荐 | `forge` / `anvil`（Windows 一键脚本会自动加 PATH） |
| MetaMask | 可选 | 前端连接钱包 |

---

## 快速启动

### 方式 B — Demo 链（推荐，Windows 一键）

```powershell
# 仓库根目录
.\start-demo.ps1
```

自动完成：**Anvil → DeployAllDemo → 写 manifest → 写 backend/.env → 启 backend + frontend**

| 参数 | 说明 |
|------|------|
| `-SkipDeploy` | 跳过重新部署（Anvil 未重启时） |
| `-SkipFrontend` | 只启 backend |
| `-SkipInstall` | 跳过 `npm install` |
| `-VerifySwaps` | 启动后跑 36 条 force swap |

**生成的配置：**

| 文件 | 内容 |
|------|------|
| `contracts/deployments/anvil-31337-demo.json` | registry、vault、swapRouter、scenarioDeployer、tokens（forge 自动写入） |
| `backend/.env` | 链上地址 + Anvil #0 私钥（`scripts/sync-backend-env.ps1` 生成） |

Backend 启动时通过 **dotenv** 自动加载 `.env`，无需手动 `$env:...`。

**验证：**

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/debug/status
# routerSwapAvailable: true, demoPoolCount: 36

# Safe swap（evaluate + 必要时 fallback 到 safe 池）
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/safe `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-toxic","amountIn":1}'

# 强制 swap（跳过 Agent，开发/批量验证用）
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/force `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-bad-safe","amountIn":1}'

# 36 条批量（默认 force 模式）
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/verify-all `
  -ContentType "application/json" -Body '{"amountIn":1}'
```

日志：`tmp/anvil.out.log`、`tmp/backend.out.log`、`tmp/frontend.out.log`

---

### 方式 A — Mock 模式（无需 Anvil）

```powershell
cd backend
npm install
$env:CHAIN_MODE = "mock"
npm run dev
```

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-a"}'   # ALLOW
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-b"}'   # REJECT
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-c"}'   # FALLBACK
```

前端：`cd frontend && npm run dev` → http://127.0.0.1:8081

---

### 方式 C — 手动 Demo 部署（非 Windows / 调试 forge）

```powershell
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000

cd contracts
forge script script/DeployAllDemo.s.sol:DeployAllDemo `
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv

# 同步 backend/.env
powershell -ExecutionPolicy Bypass -File scripts/sync-backend-env.ps1

cd backend
npm run dev
```

> Anvil 重启后重新运行 `.\start-demo.ps1` 即可（会自动 redeploy + 重写 `.env`）。

---

## API 端点

Base URL：`http://127.0.0.1:8080/api`

### 通用

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/debug/status` | 环境自检（含 `routerSwapAvailable`、`eventsPersistPath`） |
| `GET` | `/debug/pools-health` | 36 池 reserves / 健康状态（demo 模式） |
| `GET` | `/config` | risk config |
| `GET` | `/events` | 事件日志（内存 + JSONL 持久化） |
| `POST` | `/events/clear` | 清空事件 |

### Quote & Evaluate

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/quote?tokenIn=&tokenOut=&amount=` | 链上报价（demo）或 mock JSON |
| `GET` | `/quote/route/:routeId?amount=` | 单条路由报价 |
| `POST` | `/evaluate` | Agent 风险评估 |

### Execute（Vault 闸门，非 DEX）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/execute` | EIP-712 permit + Vault 闸门 |
| `GET` | `/execute/nonce?user=0x...` | permit nonce |

### Demo 元数据

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/demo/tokens` | 四代币 + 风险标签 |
| `GET` | `/demo/pools` | 36 池 |
| `GET` | `/demo/status` | demo + swap 就绪状态 |

### Swap（demo 模式，真实换币）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/swap` 或 `/swap/safe` | **默认路径**：evaluate → fallback → 滑点保护 → swap |
| `POST` | `/swap/force` | 跳过 Agent（开发 / verify-all） |
| `POST` | `/swap/verify-all` | 批量 36 条（默认 force；`{"safe":true}` 走 Agent） |
| `GET` | `/swap/wallet` | swap 钱包 + `routerAvailable` |
| `GET` | `/swap/balances` | 四代币余额 |

**执行模式：**

- **Router 模式**（配置了 `DEMO_SWAP_ROUTER_ADDRESS` + Vault + `AGENT_PRIVATE_KEY`）：`DemoSwapRouter.swapWithPermit` 一笔 tx 完成 Vault + swap
- **Direct 模式**（fallback）：`fundSwapper` → `transfer` → `pair.swap()`（3 tx）

**Agent 规则：** tokenOut 为 BAD/BAIT → REJECT（422）；TOXIC 池 → 可 FALLBACK 到同币对 SAFE 池。

详见 [`docs/api-contract.md`](docs/api-contract.md)。

---

## 配置说明

### 自动配置（推荐）

运行 `.\start-demo.ps1` 后 `backend/.env` 示例：

```env
CHAIN_MODE=demo
RPC_URL=http://127.0.0.1:8545
DEMO_REGISTRY_ADDRESS=0x...
VAULT_EXECUTION_ADDRESS=0x...
DEMO_SWAP_ROUTER_ADDRESS=0x...
DEMO_SCENARIO_DEPLOYER=0x...
SWAP_PRIVATE_KEY=0xac09...
AGENT_PRIVATE_KEY=0xac09...
```

也可只保留 `DEMO_DEPLOYMENT_PATH` — backend 会从 manifest 读取 vault/router 地址。

### Chain 模式

| 模式 | Quote | Execute | Swap |
|------|-------|---------|------|
| **mock** | `routes.json` | 进程内 mock | 404 |
| **demo** | 链上储备 | Vault（可选） | safe / force swap |
| **rpc** | 配置依赖 | 真实 Vault | 404 |

---

## 风险规则

配置：`backend/src/config/risk-config.json`（含 `maxSlippageBps: 100`）

Demo 硬规则：tokenOut = BAD/BAIT → REJECT。详见 [`docs/route-scenarios.md`](docs/route-scenarios.md)。

---

## 项目结构

```
sentinel-for-safe-execution/
├── start-demo.ps1              # 根目录快捷入口
├── scripts/
│   ├── start-demo.ps1          # Windows 一键启动
│   └── sync-backend-env.ps1    # manifest → backend/.env
├── contracts/
│   ├── src/demo/DemoSwapRouter.sol
│   ├── script/DeployAllDemo.s.sol
│   └── deployments/anvil-31337-demo.json   # 部署后自动生成（gitignore）
├── backend/
│   ├── .env                    # 自动生成（gitignore）
│   ├── data/events.jsonl        # 事件持久化
│   └── src/services/
│       ├── swapService.ts       # safe / force / router
│       ├── agentSignService.ts  # EIP-712 签名
│       └── poolHealthService.ts
├── frontend/
└── docs/
```

---

## 端口

| 服务 | 地址 |
|------|------|
| Backend | `127.0.0.1:8080` |
| Frontend | `127.0.0.1:8081` |
| Anvil | `127.0.0.1:8545` |

---

## 已知限制

- `/api/execute` 是 Vault 闸门，**不执行 DEX swap**；真实换币走 `/api/swap`
- `fundSwapper` 仅 `authorizedFunders` 可调用（Router + deployer EOA），demo 专用
- 同时只运行一个 backend 实例（8080），避免 swap 钱包 nonce 冲突
- 前端 Timeline 部分本地拼装；权威事件源 `GET /api/events` + `backend/data/events.jsonl`

---

## 参考

- 文档索引：[`docs/README.md`](docs/README.md)
- 架构：[`docs/architecture.md`](docs/architecture.md)
- API 契约：[`docs/api-contract.md`](docs/api-contract.md)
- 合约：[`contracts/README.md`](contracts/README.md)
- Phase 2 变更：[`docs/dev-changes/dev-phase2-safe-swap.md`](docs/dev-changes/dev-phase2-safe-swap.md)
