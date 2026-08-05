# Sentinel 交易账本（Sentinel Ledger）

> **Last updated**: 2026-08-05

## 背景

Monad 上的 `SentinelAchievements` 合约已**作废**。新产品从 **0 累计**，不扫历史块、不注入假数据。

| 环境 | 合约初始状态 | 徽章 / 成交量数据来源 |
|------|--------------|----------------------|
| **Anvil 本地** | `DeployAllDemo` 部署空 ledger；可选 `SeedAnvilLedger.s.sol` 写入演示 stats | 默认读链上 ledger；成交量框读本地 ledger POST |
| **Monad 测试网** | `DeployLedgerSystem` 部署空 ledger + 新 Vault/Router | `SENTINEL_LEDGER_SOURCE=chain`，读链上 `SentinelLedger.stats()`；成交量 `POOL_VOLUME_SOURCE=chain` |

## 架构

```
用户成交 (MetaMask / 后端 swap) — **Monad Testnet**
        │
        ├─ Safe Router ──► DemoSwapRouter ──► SentinelLedger.recordTrade (链上，从 0 起)
        │
        └─ 可选 POST /api/ledger/trades ──► 本地 JSON（备份；徽章/成交量默认读链）
```

**不**为徽章或成交量扫 `eth_getLogs`。`POOL_VOLUME_SOURCE=ledger`（Monad / Anvil 默认）。

## 数据结构（v2）

- **`trades`**：全部成交
- **`checkedTrades`**：经 Vault/Agent gate 的 Safe Router 成交（独立字典）
- **`checkCount`** = 该用户在 `checkedTrades` 中的条目数

## 部署模式

`DeployAllDemo.s.sol` manifest 含 `"deploymentMode": "initial"`：

- 池子、代币、Router、Vault、**空** `SentinelLedger`
- 测试用户余额由 `_fundTestUser` 注入（非 ledger stats）
- **Monad**：部署后不再 seed；后端 `LEDGER_BOOTSTRAP_ON_START=false`

### Anvil 可选链上演示数据

本地需要预填徽章/成交量做 UI 演示时（**不要**在 Monad 上跑）：

```powershell
cd contracts
$env:DEMO_LEDGER_ADDRESS = "<manifest ledger>"
$env:USDC_ADDRESS = "<manifest USDC>"
forge script script/SeedAnvilLedger.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

环境变量：`SEED_SAFE_TRADE_COUNT`（默认 8）、`SEED_USDC_PER_TRADE`（默认 100 USDC）。

## 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ledger/trades` | 成交后写入（前端自动） |
| GET | `/api/ledger/achievements/:address` | 本地账本徽章 |
| POST | `/api/ledger/bootstrap` | **可选**链上历史导入；需显式 `seedCheckCount` 才会注入假数据 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `SENTINEL_LEDGER_SOURCE=chain` | 读链上 `SentinelLedger.stats()`（Monad / Anvil 均可） |
| `POOL_VOLUME_SOURCE=chain` | 成交量来自 Monad RPC 扫 Router 事件 |
| `LEDGER_BOOTSTRAP_ON_START=false` | 启动时不扫链 / 不 seed（默认） |
| `LEDGER_BOOTSTRAP_ON_START=true` | 仅当需从链导入历史时开启 |

## 相关文件

- `contracts/script/DeployAllDemo.s.sol` — initial 部署
- `contracts/script/SeedAnvilLedger.s.sol` — Anvil 可选 seed
- `backend/src/services/tradeLedgerService.ts`
- `backend/src/services/poolVolumeService.ts` — `getPoolVolumeFromLedger`
