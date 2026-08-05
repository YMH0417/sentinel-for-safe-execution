# Changelog

## 2026-08-05 — 前端信息架构与文案

- 新增 **测试网资产** 页（`/faucet`）：Monad testnet 静态信息、官方 Gas faucet 链接、Demo USDC 领取、MetaMask 代币转账。
- **系统设置**（`/settings`）与测试网资产拆分：设置页仅授权 Agent 测试钱包（`0x881915BE…`）可见 LLM 与 mint/burn；其余用户见居中提示。
- 风控规则页精简 intro 与卡片布局；交易页移除运行分析 Tab、路由拒单改为按钮区上方内联（无右上角 toast）。
- Dashboard 侧栏「交易失败数」与「AI 最近一笔交易」在连接钱包后按 `context.account` 过滤；圆环/三格仍为平台 events 统计。
- Profile 切换从前端 UI 移除；请用 `scripts/switch-demo-profile.ps1` 或 `POST /api/demo/profile`。

## 2026-08-05 — 移除运行分析页与 legacy 池健康

- 删除前端「运行分析」Tab、`/analysis` 路由及 `/api/analysis*` 后端接口与 CLI `npm run analyze`。
- Dashboard 评分与三格占比改为 **仅基于 events**；移除 `GET /api/debug/pools-health` 及前端隐藏拉取。
- 链条状态改读账本 `GET /api/debug/pool-volume`；文档同步见 `api-contract.md`、`architecture.md`。

## 2026-08-05 — Dashboard 交易情况概览

- 三格占比：分母改为「总体活动量」（含 normal 事件与健康池稀释）；事件窗口 100 条。
- 用户 ⓘ 弹窗仅保留人话说明；计算细则见 [`dashboard-transaction-overview.md`](dashboard-transaction-overview.md)。

## 2026-08-05 — Monad testnet contract inventory

- Added [`monad-testnet-contracts.md`](monad-testnet-contracts.md): full on-chain inventory (56 active contracts), wiring diagram, orphan Vault/Router from pre-badge deploy, and **2026-08-05 RPC verification** results.
- Added `scripts/verify-monad-testnet.ps1` to re-run manifest ↔ chain sanity checks against `https://testnet-rpc.monad.xyz`.

## 2026-08-02 — Dual-chain, Settings, MetaMask swap

### Profiles & deployment

- Three demo profiles in `shared/demo-chain-profiles.json`: `anvil-local` (31337), `anvil-fork-monad` (10143 fork), `monad-testnet` (public RPC).
- Manifests: `local-31337-demo.json`, `local-10143-demo.json`, `monad-10143-demo.json`.
- `scripts/deploy-monad-testnet.ps1`, `switch-demo-profile.ps1`, `compare-profiles.ps1`, CI job `demo-local` (31337).

### Settings UI

- Switch local / fork / public chain from **Settings → 网络环境** (`POST /api/demo/profile`, hot-updates `backend/.env`).
- Token **transfer** via MetaMask; mint/burn for authorized test wallet.
- Supply refresh shows **X/Y progress** (`GET /api/demo/supply?stream=1`).

### Swap execution

- **Backend executor** when `SWAP_PRIVATE_KEY` + Router + Agent are configured (local default).
- **MetaMask wallet executor** when backend swap keys are missing (typical on `monad-testnet`): `POST /api/swap/wallet/plan` + frontend signs permit / swap.
- Safe mode on testnet requires **Agent wallet** `0x881915BE66Be800Cc180b6244809A1D188Bc1b2c` (Vault `agentSigner`).

### Monad RPC resilience

- Sequential pair reads + `withRpcRetry` for quotes, pool health, and supply (public RPC ~15 req/s limit).
- Shared `demoPairReadService.ts`; pool health no longer bursts 48 parallel `eth_call`s.

---

## 2026-07-31 — 48 routes, Safe/Unsafe, Router

- SDA pool (48 routes total); frontend Safe/Unsafe toggle.
- `POST /api/swap/safe` vs `/api/swap/force`; DemoSwapRouter one-tx path.
- Windows `start-demo.ps1`; LLM settings in Settings (Groq).

---

## 2026-07-23 — MVP

- VaultExecution EIP-712 gate, mock routes, Agent evaluate, event JSONL, analysis pipeline.
