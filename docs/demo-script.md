# Demo Script — Sentinel for Safe Execution

> **Last updated**: 2026-08-02 — 三 profile（anvil-local / fork / monad-testnet），48 routes，Safe/Unsafe。

---

## C. Demo Profiles（Anvil / Monad）

| Profile | Chain ID | MetaMask | 启动 |
|---------|----------|----------|------|
| `anvil-local` | 31337 | Anvil Local (ETH) | `.\start-demo.ps1 -VerifySwaps` |
| `anvil-fork-monad` | 10143 | Monad Testnet (Fork) / MON | `.\start-demo.ps1 -Profile anvil-fork-monad -VerifySwaps` |
| `monad-testnet` | 10143 | Monad Testnet (公网) | 先 `.\scripts\deploy-monad-testnet.ps1`，再 `.\scripts\switch-demo-profile.ps1 -Profile monad-testnet` |

```powershell
# 切换 backend（需重启 backend）
.\scripts\switch-demo-profile.ps1 -Profile monad-testnet
.\scripts\switch-demo-profile.ps1 -Profile anvil-local

# 对比 manifest
.\scripts\compare-profiles.ps1

Invoke-RestMethod http://127.0.0.1:8080/api/debug/status
# demoProfile, expectedChainId, deploymentTarget
```

Fork / local / testnet 的 **verify-all** 预期均为 **36 pass + 12 fail**（TOXIC 滑点拦截）。

---

## D. Settings 页 & MetaMask 执行（~2 分钟）

打开 http://127.0.0.1:8081/settings

### 网络环境

> "Demo 可在 **本地 Anvil (31337)**、**Fork Monad (10143)**、**公网 Monad testnet** 间切换，无需重新部署合约。Settings 调用 `POST /api/demo/profile` 重写 `backend/.env` 并热更新进程。"

展示 **Router Swap** 卡片：仅当 backend 配置了 `SWAP_PRIVATE_KEY` + Router + Agent 时可用；**monad-testnet** 上通常为不可用，属预期行为。

### 代币转账 & 余额刷新

- **转账**：MetaMask 签名 ERC-20 `transfer`
- **刷新余额**：`GET /api/demo/supply?holder=…&stream=1`，UI 显示 **3/48** 式进度（避免公网 RPC  burst 失败）

### 公网 testnet 上执行 swap

1. MetaMask 连接 **Monad Testnet (10143)**
2. 交易页获取报价 → Safe 模式需使用 **Agent 测试钱包**（Vault `agentSigner`，deploy 时写入 manifest）
3. 若 Settings 显示 Router Swap 不可用，前端自动走 **MetaMask 钱包路径**（`POST /api/swap/wallet/plan`）

> "Backend swap 密钥是可选的。公网 demo 故意不托管 swap 私钥；用户用 MetaMask 授权，Sentinel 仍做 Agent 评估与路由规划。"

---

## A. Demo Chain Script (recommended, ~3 minutes)

**Setup**: run from repo root:

```powershell
.\start-demo.ps1 -VerifySwaps -SkipInstall
```

This starts Anvil, deploys **48 pools**, writes `backend/.env`, launches backend + frontend, and runs force verify-all (36 pass + 12 TOXIC slippage blocks — expected).

Open frontend: http://127.0.0.1:8081/transaction — toggle **Safe / Unsafe** in the header.

### Opening (20s)

> "Sentinel is an execution safety layer for DeFi swaps. Before tokens move on-chain, we quote routes from real pools, score risk with deterministic rules, and either allow, reject, or suggest a safer fallback — and in our demo, we prove swaps on a local chain with two execution modes: **Safe** (Agent) and **Unsafe** (slippage only)."

### Step 1 — Quote from chain (25s)

```powershell
Invoke-RestMethod "http://127.0.0.1:8080/api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100"
```

> "Four tokens — USDC, GOOD, BAD, BAIT — twelve directed pairs, **four pool types each**: SAFE, SHALLOW, TOXIC, and **SDA** (sequence-dependent / execution-window risk). That's **48 routes**, all reading live reserves. Price ratio is 1 : 20 : 100 : 1."

Show: SAFE fair price, TOXIC inflated quote, SDA quote ≈ SAFE but Agent still rejects in Safe mode.

### Step 2 — Agent rejects (30s)

```powershell
# BAD tokenOut — hard reject
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-bad-safe","amountIn":100,"tokenIn":"USDC","tokenOut":"BAD"}'

# SDA pool — execution window risk
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-sda","amountIn":100,"tokenIn":"USDC","tokenOut":"GOOD"}'
```

> "Even on a deep pool, **BAD/BAIT** as tokenOut hard-rejects. **SDA** maps paper §3.2.2 bridge-delay risk — quote looks fine, but Agent rejects the execution window."

Compare with `route-usdc-good-safe` → ALLOW.

**Frontend (Safe mode):** 获取报价 → 风险评估 → 一键完整流程。

### Step 3 — Safe vs Unsafe contrast (40s)

**Safe — shallow fallback:**

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/safe `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-shallow","amountIn":100}'
```

> "Safe mode: Agent evaluated SHALLOW, suggested fallback, executed on SAFE pool. **No slippage band** — Agent owns the policy."

**Unsafe — SDA bypasses Agent:**

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/force `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-sda","amountIn":1,"slippageBps":100}'
```

> "Same SDA route in **Unsafe** mode: Agent bypassed, slippage check passes because quote matches SAFE reference. This is the intentional Safe vs Unsafe demo contrast."

**Unsafe — TOXIC blocked by slippage:**

```powershell
# Fails pre-chain at default 1% slippage
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/force `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-toxic","amountIn":1,"slippageBps":100}'
```

> "TOXIC quote is **too good** — slippage band catches quote deviation without Agent."

**Frontend (Unsafe mode):** 切换 Unsafe → 调滑点 →「无安全模式执行」；注意「风险评估」已禁用。

### Step 4 — Vault layer + events (20s)

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/events
Invoke-RestMethod http://127.0.0.1:8080/api/debug/pools-health
```

> "Agent soft rules + Vault hard gate + auditable JSONL events. Force swaps record `agentBypassed` and `safetyMode: force`."

### Closing (10s)

> "Sentinel optimizes for **safety**, not profit. Safe mode = Agent. Unsafe = slippage-only — for contrast and dev verification, not production defaults."

---

## B. Legacy Mock Script (~90 seconds)

For `CHAIN_MODE=mock` without Anvil.

### 30-second version

> "Sentinel intercepts swap routes **before** execution. Route-b (SDA analogue) scores 95 — **REJECT**. Route-c scores 60 — **fallback** to route-a."

### Mock demo flow (frontend)

1. Open http://127.0.0.1:8081/transaction (mock backend)
2. Get Quote → 3 routes (route-a/b/c)
3. Select route-b → 风险评估 → REJECT
4. Safe mode → route-a → ALLOW

---

## Key talking points

- **Two execution modes** — Safe (Agent) vs Unsafe (slippage only); frontend toggle makes this tangible
- **SDA pool** — paper bridge-delay mapped to on-chain execution-window REJECT in Safe mode
- **48-route matrix** — token risk × pool type × price impact
- **verify-all** — force: 36 pass + 12 TOXIC slippage fail (expected); not 48/48
- **One-click demo** — `.\start-demo.ps1`
- **Auditable** — `GET /api/events` + JSONL + tx hashes

---

## Quick reference

| Demo moment | API / UI |
|-------------|----------|
| One-click setup | `.\start-demo.ps1 -VerifySwaps` |
| Fork Monad locally | `.\start-demo.ps1 -Profile anvil-fork-monad -VerifySwaps` |
| Deploy Monad testnet | `.\scripts\deploy-monad-testnet.ps1` |
| Switch profile (CLI) | `.\scripts\switch-demo-profile.ps1 -Profile <name>` |
| Switch profile (UI) | Settings → 网络环境 |
| MetaMask wallet swap | Transaction 页（backend swap 未配置时自动） |
| Supply refresh progress | Settings → `GET /demo/supply?stream=1` |
| Show 4 pool quotes | `GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100` |
| BAD token reject | `POST /api/evaluate` `route-usdc-bad-safe` |
| SDA reject (Safe) | `POST /api/evaluate` `route-usdc-good-sda` |
| SDA execute (Unsafe) | `POST /api/swap/force` + `slippageBps: 100` |
| Safe swap + fallback | `POST /api/swap/safe` `route-usdc-good-shallow`, amount 100 |
| TOXIC slippage block | `POST /api/swap/force` `route-usdc-good-toxic`, `slippageBps: 100` |
| Batch verify | `POST /api/swap/verify-all` → 36 pass / 12 fail (force) |
| Frontend Safe/Unsafe | http://127.0.0.1:8081/transaction |
| Pool health | `GET /api/debug/pools-health` |
