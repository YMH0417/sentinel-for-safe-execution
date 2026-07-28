# Phase 2 — Safe Swap + Router + Ops（2026-07-28）

## 一键启动

```powershell
.\start-demo.ps1
```

自动：Anvil → DeployAllDemo → `anvil-31337-demo.json` → `backend/.env` → backend (+ frontend)

Anvil 重启后重新运行即可（redeploy + 重写配置）。

## 后端

| 功能 | 说明 |
|------|------|
| `POST /api/swap` / `/safe` | 默认 **evaluate → fallback → 滑点保护 → swap** |
| `POST /api/swap/force` | 跳过 Agent（原 `skipEvaluate`） |
| `GET /api/debug/pools-health` | 36 池 reserves / 可 swap / 健康状态 |
| 事件持久化 | `backend/data/events.jsonl`（重启不丢；clear 清空文件） |
| Router 一键 tx | 配置 `DEMO_SWAP_ROUTER_ADDRESS` + `VAULT_EXECUTION_ADDRESS` + `AGENT_PRIVATE_KEY` |
| dotenv | `index.ts` 启动时加载 `backend/.env` |
| chainConfig | 可从 deployment JSON fallback vault/router 地址 |

## 链上

| 合约 | 说明 |
|------|------|
| `DemoSwapRouter` | `vault.executeRoute` + `fundSwapper` + `pair.swap` **同一笔 tx** |
| `DemoPoolRegistry.getPoolByRouteId` | 按 bytes32 routeId 查池 |
| `fundSwapper` | 仅 `authorizedFunders` 可调用 |
| `DeployAllDemo` | 部署 Router 并 authorize router + deployer EOA；自动写 manifest |

## 配置

由 `scripts/sync-backend-env.ps1` 自动生成：

```env
VAULT_EXECUTION_ADDRESS=0x...
DEMO_SWAP_ROUTER_ADDRESS=0x...
AGENT_PRIVATE_KEY=0x...   # 须与 Vault agentSigner 一致
SWAP_PRIVATE_KEY=0x...
```

## 注意

- **需重新 deploy** Anvil 场景（`fundSwapper` 现为授权调用）
- `verify-all` 默认仍为 **force** 模式（36/36）；传 `"safe": true` 时 BAD/BAIT tokenOut 会 REJECT
- `risk-config.json` 新增 `maxSlippageBps: 100`（1%）
- 同时只运行一个 backend 实例，避免 swap 钱包 nonce 冲突

## CI

`.github/workflows/ci.yml` — `forge test` + `npm run build`

## 文档

同步更新：`README.md`、`docs/api-contract.md` v0.3、`docs/architecture.md`、`docs/demo-script.md`
