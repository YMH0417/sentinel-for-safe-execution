# Sentinel for Safe Execution — System Architecture

> **Last updated**: 2026-07-31 — 48 routes (SDA pool), Safe vs force slippage split, frontend Safe/Unsafe toggle.

## Overview

Execution Safety MVP: rule-based Agent evaluates swap routes; Vault enforces hard limits; demo mode runs **48 real on-chain swap routes** on Anvil (12 pairs × 4 pool types).

| Mode | Quote | Execute | Swap |
|------|-------|---------|------|
| **mock** | `routes.json` | In-process mock | N/A |
| **demo** | On-chain reserves | Vault (optional) | Safe / force swap |
| **rpc** | Config-dependent | Real EIP-712 Vault | N/A |

---

## Safe vs Unsafe (product semantics)

| Path | API | Agent | Slippage band |
|------|-----|-------|---------------|
| **Safe** | `POST /api/swap/safe` | Required — ALLOW / REJECT / FALLBACK | **Off** (`minOut=0`; Agent owns policy) |
| **Unsafe / Force** | `POST /api/swap/force` | **Bypassed** | **On** — quoted vs SAFE `expectedOut` ± `slippageBps` |

Frontend `/transaction` exposes this as **Safe / Unsafe** toggle (`SafeUnsafeToggle.tsx`). Unsafe mode disables「风险评估」and shows slippage controls only.

---

## Local Demo Topology

```text
.\start-demo.ps1
    → Anvil :8545
    → DeployAllDemo (forge broadcast, 48 pools)
    → deployments/anvil-31337-demo.json
    → scripts/sync-backend-env.ps1 → backend/.env
    → backend :8080 (dotenv)
    → frontend :8081 (optional)
```

---

## System Flow (demo — Safe path)

```
Client
    ↓ GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100
chainQuoteService → DemoPair.getReserves() → up to 4 routes (SAFE/SHALLOW/TOXIC/SDA)
    ↓ POST /api/evaluate (frontend Safe mode) or inline in swap
agentService → ALLOW | REJECT | FALLBACK (SDA / BAD/BAIT out → REJECT)
    ↓ POST /api/swap/safe { routeId, amountIn }
swapService
    ↓ evaluateRoute(); if FALLBACK → execute on route-*-safe
    ↓ re-quote (no slippage band — router minOut=0)
    ↓ executionMode:
        · router — DemoSwapRouter.swapWithPermit (Vault + swap, 1 tx)
        · direct — fundSwapper → transfer → pair.swap (3 tx)
    ↓ balance delta on recipient
eventService → memory + backend/data/events.jsonl
```

## System Flow (demo — Unsafe / force path)

```
Client
    ↓ POST /api/swap/force { routeId, amountIn, slippageBps }
swapService (skip evaluate)
    ↓ assertQuoteWithinSlippageBand(quoted, SAFE expectedOut, slippageBps)
    ↓ if TOXIC quote too high → QUOTE_DEVIATION_EXCEEDED (pre-chain)
    ↓ if SHALLOW quote too low → SLIPPAGE_EXCEEDED (pre-chain)
    ↓ else execute swap (agentBypassed=true)
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
| `DemoScenarioDeployer` | Deploy **48** pools, mint tokens, `authorizeFunder` + `fundSwapper` |
| `DemoPoolRegistry` | 48 pools sealed (`PoolLabel`: SAFE/SHALLOW/TOXIC/SDA), token risk tags |
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
| Quote | `routeService.ts`, `chainQuoteService.ts` | Mock JSON or on-chain (4 pool labels) |
| Agent | `agentService.ts` | Rules + BAD/BAIT/SDA hard reject |
| Agent sign | `agentSignService.ts` | EIP-712 for Router swaps |
| Swap | `swapService.ts` | `executeSafeSwap`, `executeForceSwap`, slippage band on force only |
| Vault | `vaultService.ts` | `executeRoute` |
| Registry | `demoRegistryService.ts` | Hydrate 48 pools |
| Pool health | `poolHealthService.ts` | `/debug/pools-health` |
| Events | `eventService.ts` | Memory + JSONL append |

Config resolution (`chainConfig.ts`):

- Env vars in `backend/.env` (auto-generated)
- Fallback: read `vaultExecution` / `swapRouter` from deployment JSON

Swap wallet: singleton + `NonceManager` + mutex (prevent nonce races).

---

## Agent Rules

**Standard** (normal profile): quote deviation, failure rate, pool risk → score 0–100.

**Demo hard rules**:

- tokenOut ∈ {BAD, BAIT} → REJECT (100)
- `poolLabel === "SDA"` → REJECT (95) — execution-window / bridge-delay analogue

**Slippage**: enforced **only** when `force=true`. Band vs SAFE reference `expectedOut`; mismatch → 409 `SLIPPAGE_EXCEEDED` or `QUOTE_DEVIATION_EXCEEDED`.

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

Context fields include `safetyMode` (`safe` | `force`), `agentBypassed`, `poolLabel`, `slippageBps`.

---

## Key Design Decisions

1. **Safe swap is the default product path** — Agent + optional fallback; no slippage band on safe.
2. **Force swap is the Unsafe dev path** — slippage-only guard; used by frontend Unsafe toggle and verify-all default.
3. **Router unifies Vault + DEX** — one tx when `DemoSwapRouter` + Agent key configured.
4. **Auto-config on deploy** — manifest + `.env` sync removes manual address copy.
5. **Execute ≠ Swap** — Vault gate and DEX remain separable for testing.
6. **Deterministic Agent** — no LLM; reproducible CI (`forge test`, verify-all).

---

## Related Docs

| Doc | Content |
|-----|---------|
| [`api-contract.md`](api-contract.md) | HTTP v0.5 |
| [`route-scenarios.md`](route-scenarios.md) | 48-route matrix + Safe/Unsafe behavior |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | Windows one-click |
| [`../contracts/README.md`](../contracts/README.md) | Forge deploy & tests |
| [`dev-changes/dev-phase2-safe-swap.md`](dev-changes/dev-phase2-safe-swap.md) | Phase 2 + 2026-07-31 updates |
