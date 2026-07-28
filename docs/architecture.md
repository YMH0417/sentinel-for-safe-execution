# Sentinel for Safe Execution — System Architecture

> **Last updated**: 2026-07-28 — safe swap, DemoSwapRouter, one-click deploy, JSONL events.

## Overview

Execution Safety MVP: rule-based Agent evaluates swap routes; Vault enforces hard limits; demo mode runs **36 real on-chain swaps** on Anvil.

| Mode | Quote | Execute | Swap |
|------|-------|---------|------|
| **mock** | `routes.json` | In-process mock | N/A |
| **demo** | On-chain reserves | Vault (optional) | Safe / force swap |
| **rpc** | Config-dependent | Real EIP-712 Vault | N/A |

---

## Local Demo Topology

```text
.\start-demo.ps1
    → Anvil :8545
    → DeployAllDemo (forge broadcast)
    → deployments/anvil-31337-demo.json
    → scripts/sync-backend-env.ps1 → backend/.env
    → backend :8080 (dotenv)
    → frontend :8081 (optional)
```

---

## System Flow (demo — recommended)

```
Client
    ↓ GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100
chainQuoteService → DemoPair.getReserves() → 3 routes
    ↓ POST /api/swap/safe { routeId, amountIn }
swapService
    ↓ evaluateRoute() → ALLOW | REJECT | FALLBACK
    ↓ if FALLBACK → re-evaluate safe route, execute on route-*-safe
    ↓ re-quote + maxSlippageBps check (risk-config.json)
    ↓ executionMode:
        · router — DemoSwapRouter.swapWithPermit (Vault + swap, 1 tx)
        · direct — fundSwapper → transfer → pair.swap (3 tx)
    ↓ balance delta on recipient
eventService → memory + backend/data/events.jsonl
```

API errors use structured `{ error: { code, message } }` via route validators and
`middleware/errorHandler.ts` (invalid JSON → 400, unknown route → 404).

### Vault-only flow (separate)

```
POST /api/evaluate → POST /api/execute { evaluation, permit, signature }
    → VaultExecution.executeRoute() → VaultExecuted | VaultRejected
```

> `/api/execute` does **not** move DEX tokens. Use `/api/swap` for demo swaps.

---

## Contracts

| Contract | Role |
|----------|------|
| `DemoScenarioDeployer` | Deploy 36 pools, mint tokens, `authorizeFunder` + `fundSwapper` |
| `DemoPoolRegistry` | 36 pools sealed, `getPoolByRouteId`, token risk tags |
| `DemoPair` | Uniswap V2-style `swap()` |
| `DemoSwapRouter` | `vault.executeRoute` + fund + swap in **one transaction** |
| `VaultExecution` | EIP-712 gate (standalone or via Router) |

Deployment manifest (auto-written by forge):

```json
{
  "chainId": 31337,
  "registry": "0x...",
  "vaultExecution": "0x...",
  "swapRouter": "0x...",
  "scenarioDeployer": "0x...",
  "agentSigner": "0x...",
  "tokens": { "USDC": "0x...", "GOOD": "0x...", "BAD": "0x...", "BAIT": "0x..." },
  "pools": []
}
```

Pools hydrated at runtime via `demoRegistryService` (RPC).

---

## Backend Modules

| Service | File | Responsibility |
|---------|------|----------------|
| Quote | `routeService.ts`, `chainQuoteService.ts` | Mock JSON or on-chain |
| Agent | `agentService.ts` | Rules + BAD/BAIT hard reject |
| Agent sign | `agentSignService.ts` | EIP-712 for Router swaps |
| Swap | `swapService.ts` | `executeSafeSwap`, `executeForceSwap`, router/direct |
| Vault | `vaultService.ts` | `executeRoute` |
| Registry | `demoRegistryService.ts` | Hydrate 36 pools |
| Pool health | `poolHealthService.ts` | `/debug/pools-health` |
| Events | `eventService.ts` | Memory + JSONL append |

Config resolution (`chainConfig.ts`):

- Env vars in `backend/.env` (auto-generated)
- Fallback: read `vaultExecution` / `swapRouter` from deployment JSON

Swap wallet: singleton + `NonceManager` + mutex (prevent nonce races).

---

## Agent Rules

**Standard** (normal profile): quote deviation, failure rate, pool risk → score 0–100.

**Demo hard rule**: tokenOut ∈ {BAD, BAIT} → REJECT (100).

**Slippage**: `maxSlippageBps` (default 100 = 1%) applied before swap; mismatch → 409 `SLIPPAGE_EXCEEDED`.

---

## Events

| Type | When |
|------|------|
| `RouteEvaluated` / `DecisionMade` | evaluate / safe swap pre-check |
| `FallbackRequired` | safe swap switched to safe route |
| `SwapExecuted` / `SwapFailed` | swap result |
| `SwapBatchCompleted` | verify-all |
| `ExecutionSuccess` / `ExecutionRejected` | Vault execute |

Persisted to `backend/data/events.jsonl`; served by `GET /api/events`.

---

## Key Design Decisions

1. **Safe swap is the default product path** — `POST /api/swap` = evaluate + fallback + slippage.
2. **Router unifies Vault + DEX** — one tx when `DemoSwapRouter` + Agent key configured.
3. **Auto-config on deploy** — manifest + `.env` sync removes manual address copy.
4. **Execute ≠ Swap** — Vault gate and DEX remain separable for testing.
5. **Deterministic Agent** — no LLM; reproducible CI (`forge test`, GitHub Actions).

---

## Related Docs

| Doc | Content |
|-----|---------|
| [`api-contract.md`](api-contract.md) | HTTP v0.3 |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | Windows one-click |
| [`../contracts/README.md`](../contracts/README.md) | Forge deploy & tests |
| [`dev-changes/dev-phase2-safe-swap.md`](dev-changes/dev-phase2-safe-swap.md) | Phase 2 changelog |
