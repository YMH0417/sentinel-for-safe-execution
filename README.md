# Sentinel for Safe Execution

**Execution Safety** — 在 swap 真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route。

本项目包含两层保护：**Agent 软规则**（报价偏差、失败率、池风险、代币风险标签、SDA 执行窗口）+ **Vault 合约硬约束**（maxLossBps、deadline、pause、EIP-712 签名）。Demo 阶段提供 **48 条真实链上 swap 路由**（含 SDA 池），用于验证报价、评估与执行闭环。

前端交易页提供 **Safe / Unsafe** 切换：Safe 走 Agent；Unsafe 绕过 Agent，仅依赖滑点带宽（相对 SAFE 公允价 ± bps）。

---

## 核心闭环

```
用户输入 swap 参数
    → Quote Service 返回候选 routes（demo 模式读链上储备）
    → Safety Agent 规则评估（ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE）
    → 执行层
        · POST /api/swap/safe — Agent 评估 + fallback + 链上 swap（无滑点带宽）
        · POST /api/swap/force — 跳过 Agent，仅滑点带宽保护
        · DemoSwapRouter（可选）— Vault 闸门 + swap 同一笔 tx
        · POST /api/execute — 独立 Vault 闸门（EIP-712，不直接调 DEX）
    → Event 日志（JSONL 持久化 + 内存查询）
    → Analysis Pipeline（校验、去重、覆盖率、统计、Sentinel 安全洞察）
```

---

## Demo 场景概览

| 项目 | 说明 |
|------|------|
| 代币 | USDC、GOOD、BAD、BAIT |
| 价格比例 | USDC : GOOD : BAD : BAIT = **1 : 20 : 100 : 1** |
| 池类型 | SAFE / SHALLOW / TOXIC / **SDA**（各 4 档） |
| 定向币对 | 4 代币两两可交易 → **12 币对 × 4 池 = 48 路由** |
| 路由命名 | `route-{tokenIn}-{tokenOut}-{pool}`，如 `route-usdc-good-sda` |
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

### Demo Profile（Anvil / Monad 双链）

定义见 [`shared/demo-chain-profiles.json`](shared/demo-chain-profiles.json)。

| Profile | Chain ID | 用途 | 一键命令 |
|---------|----------|------|----------|
| `anvil-local`（默认） | **31337** | 本地开发，MetaMask **Anvil Local** / ETH | `.\start-demo.ps1 -Profile anvil-local -VerifySwaps` |
| `anvil-fork-monad` | **10143** | Fork Monad testnet 状态，本地 MON | `.\start-demo.ps1 -Profile anvil-fork-monad -VerifySwaps` |
| `monad-testnet` | **10143** | 公网 Monad RPC | `.\scripts\deploy-monad-testnet.ps1` |

切换 backend 指向（不重新部署，需重启 backend）：

```powershell
.\scripts\switch-demo-profile.ps1 -Profile monad-testnet
.\scripts\switch-demo-profile.ps1 -Profile anvil-local
.\scripts\compare-profiles.ps1
```

> **MetaMask**：本地用 **31337**（与公网 10143 分离，避免 RPC 混用）；上 testnet 时切 **Monad Testnet (10143)**。

---

### 方式 B — Demo 链（推荐，Windows 一键）

```powershell
# 仓库根目录（默认 anvil-local @31337）
.\start-demo.ps1 -VerifySwaps
```

自动完成：**Anvil → DeployAllDemo → 写 manifest → 写 backend/.env → 启 backend + frontend**

| 参数 | 说明 |
|------|------|
| `-Profile anvil-local` | 默认；Chain ID **31337** |
| `-Profile anvil-fork-monad` | Fork `testnet-rpc.monad.xyz`，Chain ID **10143** |
| `-SkipDeploy` | 跳过重新部署（Anvil 未重启时） |
| `-SkipFrontend` | 只启 backend |
| `-SkipInstall` | 跳过 `npm install` |
| `-VerifySwaps` | 启动后跑 48 条 force verify-all（预期 36 通过 + 12 TOXIC 滑点拦截） |

**生成的配置：**

| 文件 | 内容 |
|------|------|
| `contracts/deployments/local-31337-demo.json` | local profile manifest（31337） |
| `contracts/deployments/local-10143-demo.json` | fork profile manifest（10143） |
| `contracts/deployments/monad-10143-demo.json` | Monad testnet 部署产物 |
| `backend/.env` | `DEMO_PROFILE` + 链上地址 + 私钥（local 写 Anvil #0） |

Backend 启动时通过 **dotenv** 自动加载 `.env`，无需手动 `$env:...`。

**验证：**

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/debug/status
# routerSwapAvailable: true, demoPoolCount: 48

# Safe swap（Agent 评估 + 必要时 fallback 到 safe 池；无滑点带宽）
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/safe `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-shallow","amountIn":100}'

# Unsafe / Force swap（跳过 Agent；slippageBps 相对 SAFE 公允价 ± 带宽）
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/force `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-sda","amountIn":1,"slippageBps":100}'

# 48 条批量（默认 force；TOXIC 在低滑点下预期 12 条失败）
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
| `GET` | `/debug/pools-health` | 48 池 reserves / 健康状态（demo 模式） |
| `GET` | `/config` | risk config |
| `GET` | `/events` | 事件日志（内存 + JSONL 持久化） |
| `POST` | `/events/clear` | 清空事件 |
| `GET` | `/analysis` | 分析持久化事件，返回质量、统计和安全洞察 |
| `GET` | `/analysis/definition` | 查看 Sentinel 字段映射 |
| `POST` | `/analysis/run` | 使用声明式映射分析任意 JSON records |

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
| `GET` | `/demo/pools` | 48 池 |
| `GET` | `/demo/status` | demo + swap 就绪状态 |

### Swap（demo 模式，真实换币）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/swap` 或 `/swap/safe` | **Safe 路径**：Agent 评估 → fallback → swap（**无滑点带宽**） |
| `POST` | `/swap/force` | **Unsafe 路径**：跳过 Agent，仅滑点带宽校验 |
| `POST` | `/swap/verify-all` | 批量 48 条（默认 force：36 通过 + 12 TOXIC 拦截；`{"safe":true}` 走 Agent） |
| `GET` | `/swap/wallet` | swap 钱包 + `routerAvailable` |
| `GET` | `/swap/balances` | 四代币余额 |

**执行模式：**

- **Router 模式**（配置了 `DEMO_SWAP_ROUTER_ADDRESS` + Vault + `AGENT_PRIVATE_KEY`）：`DemoSwapRouter.swapWithPermit` 一笔 tx 完成 Vault + swap
- **Direct 模式**（fallback）：`fundSwapper` → `transfer` → `pair.swap()`（3 tx）

**Agent 规则：** tokenOut 为 BAD/BAIT → REJECT；SDA 池 → REJECT（执行窗口风险）；TOXIC / SHALLOW → 可 FALLBACK 到同币对 SAFE 池。

**前端 Safe / Unsafe（`/transaction`）：**

| 模式 | API | Agent | 滑点 |
|------|-----|-------|------|
| Safe | `/api/swap/safe` | 必须先「风险评估」 | 关闭（由 Agent 把关） |
| Unsafe | `/api/swap/force` | 绕过 | 唯一保护（± bps vs SAFE `expectedOut`） |

详见 [`docs/api-contract.md`](docs/api-contract.md)。

### 可复用数据分析

分析本地 Sentinel 事件：

```bash
cd backend
npm run analyze -- --input data/events.jsonl
```

同一引擎可分析 JSON、JSONL/NDJSON 或 CSV。新项目提供字段映射 JSON，
无需重写解析、校验、去重和通用统计代码：

```bash
npm run analyze -- --input orders.csv --config orders-analysis.json
```

设计、字段和完整用法见
[`docs/analysis-pipeline.md`](docs/analysis-pipeline.md)。

浏览器中的 `/analysis` 页面会直接渲染同一份实时报告，包括决策柱状图、
事件趋势线、数据质量、风险因子、执行结果、证据就绪度、字段覆盖率和路由活动；没有运行数据时会
明确显示空状态，不会用演示数字代替观测值。

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

配置：`backend/src/config/risk-config.json`（`maxSlippageBps` 仅用于 **force** 模式默认滑点）

Demo 硬规则：tokenOut = BAD/BAIT → REJECT；SDA 池 → REJECT。详见 [`docs/route-scenarios.md`](docs/route-scenarios.md)。

---

## 项目结构

```
sentinel-for-safe-execution/
├── start-demo.ps1              # 根目录快捷入口
├── switch-demo.ps1             # 切换 DEMO_PROFILE（转发 scripts/）
├── shared/demo-chain-profiles.json
├── scripts/
│   ├── start-demo.ps1          # Windows 一键启动（-Profile）
│   ├── switch-demo-profile.ps1 # 切换 backend 指向
│   ├── deploy-monad-testnet.ps1
│   ├── compare-profiles.ps1
│   ├── sync-backend-env.ps1    # manifest → backend/.env
│   └── ci-demo-local.sh        # CI: Anvil 31337 + verify-all
├── contracts/
│   ├── src/demo/DemoSwapRouter.sol
│   ├── script/DeployAllDemo.s.sol
│   └── deployments/local-31337-demo.json   # 部署后写入
├── backend/
│   ├── .env                    # 自动生成（gitignore）
│   ├── data/events.jsonl        # 事件持久化
│   └── src/
│       ├── analysis/             # 可复用分析引擎
│       ├── config/sentinel-analysis.json
│       ├── routes/analysis.ts
│       ├── cli/analyze.ts
│       └── services/
│           ├── swapService.ts       # safe / force / router
│           ├── agentSignService.ts  # EIP-712 签名
│           └── poolHealthService.ts
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
- 旧事件缺少的分析字段会显示为低覆盖率；不会从日志文本中猜测数值

---

## 参考

- 文档索引：[`docs/README.md`](docs/README.md)
- 架构：[`docs/architecture.md`](docs/architecture.md)
- API 契约：[`docs/api-contract.md`](docs/api-contract.md)
- 合约：[`contracts/README.md`](contracts/README.md)
- Phase 2 变更：[`docs/dev-changes/dev-phase2-safe-swap.md`](docs/dev-changes/dev-phase2-safe-swap.md)
