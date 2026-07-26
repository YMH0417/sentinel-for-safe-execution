# Sentinel for Safe Execution

**Execution Safety** — 在交易真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route。

> **当前阶段**：Week 3 基线已完成，作为接下来**两周黑客松**的联调底座。  
> 计划后续在 **Monad Testnet（chain ID 10143）** 部署项目代币与交易池；本周代码重点是**稳定闭环 + 可回归测试**，而非录屏/答辩交付。

---

## 核心闭环

```
用户输入 swap 参数
    → Quote Service 返回候选 routes
    → Safety Agent 规则评估（ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE）
    → Vault Execution 链上闸门（执行或拦截）
    → Event 日志（可审计）
```

两层保护：**Agent 软规则**（报价偏差、失败率、池风险）+ **合约硬约束**（maxLossBps、deadline、pause、EIP-712 签名）。

---

## 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | backend / frontend |
| npm | 随 Node | 依赖安装 |
| Foundry | 可选 | 合约编译、测试、部署（`forge`, `anvil`） |
| MetaMask | 可选 | 前端 Demo 连接钱包 |

---

## 快速启动

### 方式 A — 仅后端联调（推荐日常开发，无需 Anvil）

**终端 1 — 启动 backend（mock chain）**

```powershell
cd backend
$env:CHAIN_MODE = "mock"
npm install   # 首次
npm run dev
```

监听 `http://127.0.0.1:8080`。mock 模式下 `/api/execute` 和 `/api/execute/nonce` **不访问 RPC**，适合黑客松前期快速迭代。

**终端 2 — 手动验证（可选）**

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/health
Invoke-RestMethod http://127.0.0.1:8080/api/debug/status

Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-a"}'
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-b"}'
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-c"}'
# 预期：ALLOW(0) / REJECT(95) / FALLBACK(60)
```

**终端 3 — 前端（可选）**

```powershell
cd frontend
npm install   # 首次
npm run dev
```

- 前端：http://127.0.0.1:8081  
- Vite 将 `/api/*` 代理到 `http://127.0.0.1:8080`  
- 需 MetaMask 连接后进入 **交易检测** 页面（`/transaction`）

### 方式 B — 真实链联调（Anvil 或 Monad）

**终端 1 — 本地链**

```bash
cd contracts
anvil   # 127.0.0.1:8545
```

**终端 2 — 部署合约**

```bash
cd contracts
# 配置 .env：PRIVATE_KEY, AGENT_SIGNER（见 contracts/.env.example）
forge script script/DeployVaultExecution.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

**终端 3 — 后端（RPC 模式）**

复制 `backend/.env.example` → `backend/.env`，填写：

```env
# 不设 CHAIN_MODE 或设为 rpc
RPC_URL=http://127.0.0.1:8545
VAULT_EXECUTION_ADDRESS=0x...   # 部署输出
EXECUTOR_PRIVATE_KEY=0x...        # 提交交易的账户（非 Agent signer）
```

```powershell
cd backend
npm run dev
```

Monad Testnet 部署步骤见 [`contracts/README.md`](contracts/README.md)（`MONAD_RPC_URL`）。

---

## API 端点

Base URL：`http://127.0.0.1:8080/api`（前端通过 Vite 代理访问 `/api/...`）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/debug/status` | 环境自检（chainMode、route 数、event 数、profile） |
| `GET` | `/quote?tokenIn=USDT&tokenOut=USDC&amount=1000` | 返回候选 routes |
| `POST` | `/evaluate` | Body: `{ "routeId", "configProfile?" }` — Agent 风险评估 |
| `POST` | `/execute` | Body: `{ evaluation, permit, signature }` — 链上执行闸门 |
| `GET` | `/execute/nonce?user=0x...` | 查询用户 permit nonce |
| `GET` | `/events` | 后端内存事件日志（权威 timeline） |
| `GET` | `/config` | 读取 risk config；可选 `?profile=conservative` |

### evaluate 快速验证

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-a"}'
# → ALLOW, riskScore: 0

Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-b"}'
# → REJECT, riskScore: 95

Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" -Body '{"routeId":"route-c"}'
# → FALLBACK_TO_SAFE_ROUTE, riskScore: 60
```

### mock 模式下 execute

legacy 简化请求（仅 mock 模式）：

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/execute `
  -ContentType "application/json" -Body '{"routeId":"route-a"}'
```

完整 permit 格式见 [`docs/api-contract.md`](docs/api-contract.md) 与 [`contracts/integration/execution-permit.json`](contracts/integration/execution-permit.json)。

> **说明**：`/config`、`/debug/status` 为 Week 3 收尾新增；若 `docs/api-contract.md` 尚未同步，以本 README 与 backend 实现为准，由 Dev D 维护文档。

---

## 三条核心 Route（normal profile）

数据文件：`shared/demo-data/routes.json`（v1.0 冻结，含 `_meta.version`）

| Route | 预期 Decision | riskScore | 场景 |
|-------|--------------|-----------|------|
| route-a | ALLOW | 0 | 健康 SIA 路由，报价偏差 0.2% |
| route-b | REJECT | 95 | SDA 桥接延迟，偏差 8%、失败率 45% |
| route-c | FALLBACK_TO_SAFE_ROUTE | 60 | 中等风险，fallback → route-a |

场景设计详见 [`docs/route-scenarios.md`](docs/route-scenarios.md)（Dev C 维护）。

---

## 风险规则引擎（Dev E）

配置文件：`backend/src/config/risk-config.json`（Dev B 维护）

**三条规则**（normal profile 阈值）：

| 规则 | 条件 | Flag |
|------|------|------|
| A — Quote Deviation | `\|quotedOut - expectedOut\| / expectedOut > 0.008` | `quote_deviation` |
| B — Failure Risk | `historicalFailureRate > 0.20` | `failure_risk` |
| C — Pool Risk | `poolRiskScore > 70` | `pool_risk` |

**决策阈值**：

| riskScore | 决策 |
|-----------|------|
| < 40 | `ALLOW` |
| 40–69 且 `supportsFallback` | `FALLBACK_TO_SAFE_ROUTE` |
| ≥ 70 | `REJECT` |

Profile：`normal`（默认）/ `conservative` / `aggressive`。黑客松联调统一使用 **normal**。

evaluate 响应含 `reason`（用户向）与 `reasonTechnical`（技术向 breakdown）。

实现：`backend/src/services/agentService.ts`

---

## Chain 模式

| 模式 | 设置 | 行为 |
|------|------|------|
| **mock** | `$env:CHAIN_MODE = "mock"` | execute / nonce 不连 RPC；dummy 签名可过；进程内 nonce |
| **rpc** | 不设置或 `CHAIN_MODE=rpc` | 需配置 RPC + 合约地址 + EXECUTOR_PRIVATE_KEY；真实 EIP-712 |

启动日志会打印 `Chain mode: mock` 或 `rpc`。

---

## 合约

```bash
cd contracts
forge build
forge test          # 17 tests

# ABI
# → contracts/abi/VaultExecution.json

# EIP-712 schema
# → contracts/integration/execution-permit.json
```

`VaultExecution.sol` 校验 Agent 签名的 permit，REJECT 或 `riskScore >= 70` 时发出 `VaultRejected` 事件。

---

## 生产构建

```powershell
cd backend
npm run build
node dist/index.js

cd frontend
npm run build
# 静态文件在 frontend/dist/
```

---

## 项目结构

```
sentinel-for-safe-execution/
├── contracts/
│   ├── src/VaultExecution.sol       # 链上执行闸门
│   ├── script/DeployVaultExecution.s.sol
│   ├── test/                        # Foundry 测试
│   ├── abi/VaultExecution.json
│   └── integration/execution-permit.json
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Express 入口
│   │   ├── routes/                  # quote, evaluate, execute, events, config, debug
│   │   ├── services/                # route, agent, vault, event, mockChain
│   │   └── config/risk-config.json
│   └── .env.example
├── frontend/
│   └── src/components/              # TransactionPage, SafetyPanel, Timeline 等
├── shared/
│   ├── types/                       # Route, Decision, Event
│   └── demo-data/
│       ├── routes.json                # 3 条核心 route（冻结）
│       └── demo-routes.json
└── docs/                            # 各 Dev 自行维护，勿随意覆盖
    ├── api-contract.md              # Dev D
    ├── architecture.md
    ├── demo-script.md
    ├── route-scenarios.md           # Dev C
    └── dev-changes/                 # 各 Dev 变更记录
```

---

## 端口

| 服务 | 地址 |
|------|------|
| Backend | `127.0.0.1:8080` |
| Frontend | `127.0.0.1:8081` |
| Anvil | `127.0.0.1:8545` |

> Windows 上 3000–3005 端口可能被系统阻止（EACCES），故默认使用 8080/8081。

---

## 团队分工

| 角色 | 负责模块 | 关键文件 |
|------|----------|----------|
| **Dev A** | 合约、部署、EIP-712 | `contracts/src/`, `contracts/README.md` |
| **Dev B** | 风险配置 | `backend/src/config/risk-config.json` |
| **Dev C** | Mock routes、场景数据 | `shared/demo-data/`, `docs/route-scenarios.md` |
| **Dev D** | Backend API、编排、事件 | `backend/src/routes/`, `docs/api-contract.md` |
| **Dev E** | Safety Agent 规则引擎 | `backend/src/services/agentService.ts` |
| **前端** | Demo UI | `frontend/src/`（黑客松前期尽量冻结） |
| **设计** | 页面结构与视觉 | 自行维护设计文档 |
| **运营** | 对外叙事、提交物 | 自行维护 |

接口或 schema 变更：**先改代码 → 通知 Dev D 更新 `docs/api-contract.md` → 用上方 evaluate 命令回归**。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 合约 | Solidity 0.8.24, Foundry |
| 后端 | Node.js, Express, TypeScript, ethers v6 |
| 前端 | React 19, Vite, TypeScript, MetaMask（`window.ethereum`） |
| 数据 | JSON mock routes + 内存 event log（无数据库） |
| 链 | mock 模式 / Anvil / Monad Testnet (10143) |

---

## 已知限制（Week 3 基线接受范围）

- 前端 Timeline 为页面本地拼装；权威事件源为 `GET /api/events`
- 前端 `configProfile` 写死 `normal`；切换 profile 请用 API 或 Postman
- mock 模式不验证真实 EIP-712 签名
- Quote 数据来自 mock JSON，尚未接链上 pool（黑客松阶段替换）

---

## 参考

- 论文：[2501.17335v2](docs/2501.17335v2.pdf) — *Pandora's Box: Cross-Chain Arbitrages in the Realm of Blockchain Interoperability*
- Week 3 计划：`week3_plan.md`
