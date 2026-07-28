# Dev D 变更记录 — Demo Chain + Swap API（2026-07-28）

> **Superseded by** [`dev-phase2-safe-swap.md`](dev-phase2-safe-swap.md)（safe swap、Router、一键启动、API v0.3）。下文为 Phase 1 历史记录。

## 变更目的

将 backend 从 mock-only 报价升级为 **demo 链模式**：36 条路由链上报价、Agent 评估、**真实 swap** 改钱包余额；与 Vault 闸门 (`/api/execute`) 分离。

## 主要改动

### 1. Chain 模式扩展

| 模式 | 行为 |
|------|------|
| `mock` | 不变 — `routes.json` + mock execute |
| `demo` | 链上 quote + swap API |
| `rpc` | Vault 真实执行 |

### 2. 新增路由模块

| 文件 | 说明 |
|------|------|
| `routes/swap.ts` | POST `/swap`, `/swap/verify-all`, GET balances/wallet |
| `routes/demo.ts` | `/demo/tokens`, `/demo/pools`, `/demo/status` |
| `services/swapService.ts` | fundSwapper → transfer → swap，余额 delta |
| `services/chainQuoteService.ts` | 任意 tokenIn→tokenOut，读储备 |
| `services/demoRegistryService.ts` | hydrate 36 pools |
| `config/demoRoutes.ts` | 路由命名与 bytes32 映射 |
| `config/chainConfig.ts` | swap wallet 单例 + NonceManager |

### 3. 事件类型

新增：`SwapExecuted`, `SwapFailed`, `SwapBatchCompleted`

### 4. 验证

- `POST /api/swap/verify-all` → **36/36 passed**
- `npm run verify:swaps` → `scripts/verify-swaps.ps1`
- 记录：`tmp/swap-api-36-results.md`

### 5. 文档

同步：`README.md`, `docs/api-contract.md` v0.2, `docs/architecture.md`, `docs/demo-script.md`, `docs/route-scenarios.md`

## 运维注意

- 只运行 **一个** backend 实例（8080），避免 swap 钱包 nonce 冲突
- Anvil 重启 → 重新 deploy → 更新 `DEMO_REGISTRY_ADDRESS`
- BAD/BAIT 作 tokenOut：evaluate REJECT；swap 需 `skipEvaluate: true`

## 影响文件

| 文件 | 说明 |
|------|------|
| `backend/src/index.ts` | 注册 swap、demo 路由 |
| `backend/src/routes/debug.ts` | swapConfigured / swapWallet |
| `backend/.env.example` | SWAP_PRIVATE_KEY, DEMO_REGISTRY |
| `backend/package.json` | verify:swaps script |

## API 契约

详见 [`docs/api-contract.md`](../api-contract.md) v0.2。
