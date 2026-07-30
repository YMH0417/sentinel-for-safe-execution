# Demo Script — Sentinel for Safe Execution

> **Last updated**: 2026-07-30 — safe swap, fallback, DemoSwapRouter, one-click deploy.

---

## A. Demo Chain Script (recommended, ~2 minutes)

**Setup**: run from repo root:

```powershell
.\start-demo.ps1
```

This starts Anvil, deploys contracts, writes `backend/.env`, and launches backend + frontend.

### Opening (20s)

> "Sentinel is an execution safety layer for DeFi swaps. Before tokens move on-chain, we quote routes from real pools, score risk with deterministic rules, and either allow, reject, or switch to a safer fallback route — and in our demo, we prove every swap on a local chain."

### Step 1 — Quote from chain (25s)

```powershell
Invoke-RestMethod "http://127.0.0.1:8080/api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100"
```

> "Four tokens — USDC, GOOD, BAD, BAIT — twelve directed pairs, three pool types each: SAFE, SHALLOW, TOXIC. That's **36 routes**, all reading live reserves. Price ratio is 1 : 20 : 100 : 1."

Show three routes: SAFE best price, TOXIC suspicious quote flags.

### Step 2 — Agent rejects toxic token (25s)

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/evaluate `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-bad-safe","amountIn":100}'
```

> "Even on the SAFE pool, if you're buying **BAD** or **BAIT**, the Agent hard-rejects — registry risk tags override the quote. Score 100, REJECT."

Compare with `route-usdc-good-safe` → ALLOW.

### Step 3 — Safe swap with fallback (30s)

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/debug/status
# routerSwapAvailable: true

Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/safe `
  -ContentType "application/json" `
  -Body '{"routeId":"route-usdc-good-shallow","amountIn":100}'
```

> "User asked for the SHALLOW pool with a large trade, but Sentinel evaluated the risk and **fell back** to the SAFE pool automatically. One API call — evaluate, fallback, slippage check, swap. With DemoSwapRouter, Vault gate and DEX swap happen in **one transaction**."

Show response fields: `requestedRouteId`, `executedRouteId`, `agentDecision`, `executionMode`.

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/swap/balances
```

Optional: `POST /api/swap/verify-all` → "36 for 36 passed (force mode)."

### Step 4 — Vault layer + events (20s)

> "The Vault contract enforces hard limits: EIP-712 signed permits, nonce replay protection, max loss, pause. Agent soft rules + contract hard gate — two layers. Events persist to JSONL — auditable across restarts."

```powershell
Invoke-RestMethod http://127.0.0.1:8080/api/events
Invoke-RestMethod http://127.0.0.1:8080/api/debug/pools-health
```

### Closing (10s)

> "Sentinel optimizes for **safety**, not profit. Every step is auditable. Deterministic rules — no black-box AI."

---

## B. Legacy Mock Script (~90 seconds)

For `CHAIN_MODE=mock` without Anvil.

### 30-second version

> "Sentinel intercepts swap routes **before** execution. It scores quote deviation, failure rate, and pool risk. Route-b scores 95 — **REJECT**. Route-c scores 60 — **fallback** to route-a. Without Sentinel you'd eat an 8% quote gap on a bridge-delay path."

### 90-second version

> "Quote Service returns three candidate routes. Safety Agent applies three rules and outputs 0–100 risk score. Vault contract is the final gate with deadline, nonce, and pause.
>
> I select route-b → REJECT at 95. Switch to safe mode → fallback to route-a → ALLOW.
>
> Full timeline: evaluated → decision → execution result. Auditable, deterministic."

### Mock demo flow (frontend)

1. Open http://127.0.0.1:8081/transaction
2. Get Quote → 3 routes (route-a/b/c)
3. Select route-b → Run With Safety Agent → REJECT
4. Timeline shows event chain
5. Safe mode → route-a → ALLOW

---

## Key talking points

- **Safety over profit** — block bad paths before funds move
- **Two layers** — Agent (soft) + Vault (hard); demo adds real pool quotes + fallback
- **36-route matrix** — token risk × pool toxicity × price impact
- **One-click demo** — `.\start-demo.ps1` redeploys and syncs config automatically
- **Auditable** — `GET /api/events` + `backend/data/events.jsonl`, on-chain tx hashes
- **Deterministic** — same input → same decision; CI (`forge test`, GitHub Actions)

---

## Quick reference

| Demo moment | API |
|-------------|-----|
| One-click setup | `.\start-demo.ps1` |
| Show 3 pool quotes | `GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100` |
| BAD token reject | `POST /api/evaluate` `route-usdc-bad-safe` |
| SAFE allow | `POST /api/evaluate` `route-usdc-good-safe` |
| Safe swap + fallback | `POST /api/swap/safe` `route-usdc-good-shallow`, amount 100 |
| Force swap (dev) | `POST /api/swap/force` |
| 36/36 proof | `POST /api/swap/verify-all` |
| Pool health | `GET /api/debug/pools-health` |
| Mock REJECT | `POST /api/evaluate` `route-b` |
