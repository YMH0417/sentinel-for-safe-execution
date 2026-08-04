# Sentinel 架构（Vercel + Neon 目标）

> **Last updated**: 2026-08-05

## 一句话

- **产品库（Neon）**：事件、成交、徽章、交易池状态 — 前端 Dashboard / 个人页只读 API。
- **链（RPC）**：仅 Settings 链状态、下单前 quote/evaluate、真实发 tx。

不再用 Anvil 合约当「数据库」，不再 hybrid 双链读。

---

## 三层

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vercel Static / Vite build)                   │
│  Dashboard · Profile · Swap UI                           │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS /api/*
┌───────────────────────────▼─────────────────────────────┐
│  API (Vercel Serverless — 现 Express，可迁 Next Route)   │
│                                                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │ Product DB      │    │ Chain Gateway (RPC)         │ │
│  │ Neon Postgres   │    │ 仅 quote / evaluate / swap  │ │
│  │                 │    │ / settings 链诊断            │ │
│  │ • events        │    └─────────────────────────────┘ │
│  │ • ledger_trades │              │                     │
│  │ • checked_trades│              │ ethers → Monad      │
│  └────────▲────────┘              ▼                     │
│           │ write              on-chain tx             │
└───────────┼────────────────────────────────────────────┘
            │
     swap 成功后 POST /api/ledger/trades
     evaluate 后 addEvent
```

---

## 数据谁存什么

| 数据 | 本地开发（现在） | Vercel 生产（目标） | 谁写 | 谁读 |
|------|------------------|---------------------|------|------|
| Agent / Swap 事件 | `data/events.jsonl` | `events` 表 | evaluate、swap、execute | Dashboard 分/警报 |
| 全部成交 | `trade-ledger.json` → `trades[]` | `ledger_trades` | POST ledger、后端 swap 镜像 | 历史列表 |
| 经 Check 成交 | `checkedTrades{}` | `ledger_checked_trades` | 同上，`registerCheck: true` | checkCount、徽章 |
| 交易池状态 4 行 | JSON 按 `poolLabel` 聚合 | SQL 聚合近 N 笔 | 随 ledger 写入自动 | `/api/debug/pool-volume` |
| 用户徽章统计 | JSON `users{}` 或现场聚合 | 视图 / 聚合查询 | 随 ledger | `/api/demo/achievements` |
| 路由 / Agent 规则 | `shared/demo-data/routes.json` + `risk-config.json` | 仓库静态或 DB 种子 | 部署时 | evaluate |
| 合约地址 | manifest + env | Vercel Env | 部署脚本 | chain gateway |
| 链上 reserves / 报价 | — | — | 不持久化 | evaluate、quote 时 RPC 读 |

**不存进 DB 的**：实时余额、池 reserves、区块扫描结果（除非 Settings 调试接口临时读）。

---

## API 分区

### A. 只读产品库（无 RPC）

| 方法 | 路径 | 数据源 |
|------|------|--------|
| GET | `/api/events` | events |
| GET | `/api/ledger/trades/:addr` | ledger |
| GET | `/api/ledger/achievements/:addr` | ledger |
| GET | `/api/demo/achievements/:addr` | ledger（别名） |
| GET | `/api/debug/pool-volume` | ledger 聚合 |
| POST | `/api/ai-alert-analysis*` | events（Dashboard AI 解读） |

### B. 写产品库（无 RPC）

| 方法 | 路径 | 触发 |
|------|------|------|
| POST | `/api/ledger/trades` | 钱包 swap 完成 / 后端 mirror |
| — | `addEvent()` 内部 | evaluate、swap 生命周期 |

### C. 必须 RPC（链）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/quote*` | 链上报价 |
| POST | `/api/evaluate` | 报价 + 规则 → 决策 → **写 events** |
| POST | `/api/swap/*` | 发 tx → **写 events + ledger** |
| POST | `/api/execute` | Vault 执行 |
| GET | `/api/swap/balances` | 余额 |
| GET | `/api/demo/tokens|pools` | 注册表链上读 |
| GET | `/api/debug/rpc-check` | Settings |

---

## 成交闭环（标准路径）

```
1. GET /api/quote/route/:id     ← RPC（一次）
2. POST /api/evaluate           ← RPC 报价 + 写 events
3. MetaMask swap / POST /api/swap/wallet/plan + 链上 tx   ← RPC
4. POST /api/ledger/trades      ← 只写 DB（registerCheck 按路径）
5. GET /api/debug/pool-volume   ← 只读 DB
6. GET /api/demo/achievements   ← 只读 DB
```

---

## Vercel + Neon 免费档注意点

| 话题 | 做法 |
|------|------|
| **不能写本地文件** | `events.jsonl` / `trade-ledger.json` → Neon（见 `docs/neon-schema.sql`） |
| **无长期后台进程** | 去掉 `setInterval` 轮询；pool-volume 请求时算或 Vercel Cron 预热 |
| **Serverless 冷启动** | 连接池用 `@neondatabase/serverless` 或 Prisma + Neon |
| **密钥** | `DATABASE_URL`、`MONAD_RPC_URL`、`AGENT_PRIVATE_KEY` → Vercel Env |
| **前端** | `frontend` build → Vercel；`VITE_API_URL` 指向 API |
| **CORS** | API 允许前端域名 |
| **Anvil / hybrid** | 仅本地 dev；生产 env 不设 `DEMO_HYBRID_MODE` |

---

## 本地 dev vs 生产

| | 本地 | Vercel + Neon |
|---|------|----------------|
| 产品库 | JSON 文件（`STORAGE_DRIVER=file`）或 Neon（`DATABASE_URL`） | Postgres（`DATABASE_URL`） |
| 执行链 | Anvil 或 Monad testnet | Monad testnet |
| SentinelLedger 合约 | 可选，**不参与产品读** | 不用 |
| 启动脚本 | `start-demo.ps1` | `vercel deploy` + Neon migrate |

---

## 待删 / 已弃用（收敛方向）

- `DEMO_HYBRID_MODE`、Anvil ledger 读、mirror 写链
- `ledgerChainMirrorService`
- `getPoolVolumeFromAnvilLedger` / `getPoolVolumeFromChain`（Dashboard 用）
- `ledgerBootstrapService` 扫链 seed
- `chainTradeIndexService` 为 volume/bootstrap 服务（可保留给 debug）

---

## 相关文件

- `docs/neon-schema.sql` — 表结构（与 `backend/src/storage/schema.sql` 同步）
- `backend/src/storage/` — Postgres / file 双实现（`DATABASE_URL` 切换）
- `backend/src/services/tradeLedgerService.ts` — 账本业务层
- `backend/src/services/eventService.ts` — 事件业务层
- `shared/demo-data/routes.json` — 静态路由
