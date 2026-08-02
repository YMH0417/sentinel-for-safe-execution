# Sentinel for Safe Execution — System Architecture

> **Last updated**: 2026-08-02 — Three demo profiles, Settings profile switch, MetaMask wallet swap, Monad RPC pacing.

## Overview

Execution Safety MVP: rule-based Agent evaluates swap routes; Vault enforces hard limits; demo mode runs **48 real on-chain swap routes** (12 pairs × 4 pool types) on Anvil or Monad testnet.

| Mode | Quote | Execute | Swap |
|------|-------|---------|------|
| **mock** | `routes.json` | In-process mock | N/A |
| **demo** | On-chain reserves | Vault (optional) | Backend safe/force **or** MetaMask wallet plan |
| **rpc** | Config-dependent | Real EIP-712 Vault | N/A |

### Demo profiles

| Profile | Chain ID | RPC | Notes |
|---------|----------|-----|-------|
| `anvil-local` | 31337 | Local Anvil | Full backend keys; Router swap available |
| `anvil-fork-monad` | 10143 | Anvil fork | Same as local keys on fork state |
| `monad-testnet` | 10143 | Public Monad RPC | Often no `SWAP_PRIVATE_KEY`; wallet path + RPC pacing |

Definition: `shared/demo-chain-profiles.json`. Switch via Settings (`POST /api/demo/profile`) or `scripts/switch-demo-profile.ps1`.

---

## Safe vs Unsafe (product semantics)

| Path | API | Agent | Slippage band |
|------|-----|-------|---------------|
| **Safe** | `POST /api/swap/safe` or wallet plan + MetaMask | Required — ALLOW / REJECT / FALLBACK | **Off** (`minOut=0`; Agent owns policy) |
| **Unsafe / Force** | `POST /api/swap/force` or wallet plan `force: true` | **Bypassed** | **On** — quoted vs SAFE `expectedOut` ± `slippageBps` |

Frontend `/transaction` exposes **Safe / Unsafe** toggle. When backend swap is unavailable, frontend uses **MetaMask execution** (`demoWalletSwap.ts`).

---

## Local Demo Topology

```text
.\start-demo.ps1 [-Profile anvil-local | anvil-fork-monad]
    → Anvil :8545 (or fork)
    → DeployAllDemo (forge broadcast, 48 pools)
    → deployments/local-{chainId}-demo.json
    → scripts/sync-backend-env.ps1 → backend/.env
    → backend :8080 (dotenv)
    → frontend :8081

monad-testnet:
    scripts/deploy-monad-testnet.ps1 → monad-10143-demo.json
    Settings or switch-demo-profile.ps1 → backend/.env (no redeploy)
```

---

## System Flow (demo — Safe path, backend executor)

```
Client
    ↓ GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100
chainQuoteService → demoPairReadService.readSwapReserves() → up to 4 routes
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

## System Flow (demo — MetaMask wallet executor)

```
Client (TransactionPage)
    ↓ preflight: swapConfigured? routerSwapAvailable?
    ↓ if backend swap unavailable → wallet path
POST /api/swap/wallet/plan { routeId, amountIn, recipient, force? }
    ↓ Agent evaluation + quote (same rules as backend swap)
    ↓ returns executionStrategy: router | direct | sda
Frontend demoWalletSwap.ts
    ↓ user signs permit / transfer / swap via MetaMask
    ↓ Safe + router requires wallet = Vault agentSigner
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

> `/api/execute` does **not** move DEX tokens. Use `/api/swap` or wallet plan for demo swaps.

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

Pools hydrated at runtime via `demoRegistryService` (RPC, 30s live config cache).

---

## Backend Modules

| Service | File | Responsibility |
|---------|------|----------------|
| Quote | `routeService.ts`, `chainQuoteService.ts` | Mock JSON or on-chain (4 pool labels) |
| Pair read | `demoPairReadService.ts` | Shared reserves read + RPC retry + remote pacing |
| Agent | `agentService.ts` | Rules + BAD/BAIT/SDA hard reject |
| Agent sign | `agentSignService.ts` | EIP-712 for Router swaps |
| Swap | `swapService.ts` | `executeSafeSwap`, `executeForceSwap`, `planWalletDemoSwap` |
| Profile switch | `demoProfileSwitchService.ts` | List/switch profiles, rewrite `.env`, hot reload |
| Supply | `demoSupplyService.ts` | Mint/burn overview, NDJSON stream |
| Vault | `vaultService.ts` | `executeRoute` |
| Registry | `demoRegistryService.ts` | Hydrate 48 pools |
| Pool health | `poolHealthService.ts` | Sequential `/debug/pools-health` |
| RPC retry | `utils/rpcRetry.ts` | Retry `missing revert data` on public RPC |
| Events | `eventService.ts` | Memory + JSONL append |

Config resolution (`chainConfig.ts`):

- Env vars in `backend/.env` (auto-generated or Settings switch)
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
3. **Dual executors** — Backend when keys configured; MetaMask when not (typical on public testnet).
4. **Router unifies Vault + DEX** — one tx when `DemoSwapRouter` + Agent key configured.
5. **Profile switch without redeploy** — Settings hot-updates env for monad-testnet vs local demos.
6. **Monad RPC resilience** — sequential reads, retry, pacing; avoid 48-way parallel `eth_call`.
7. **Execute ≠ Swap** — Vault gate and DEX remain separable for testing.
8. **Deterministic Agent** — no LLM; reproducible CI (`forge test`, verify-all).

---

## Related Docs

| Doc | Content |
|-----|---------|
| [`api-contract.md`](api-contract.md) | HTTP v0.6 |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes |
| [`route-scenarios.md`](route-scenarios.md) | 48-route matrix + Safe/Unsafe behavior |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | Windows one-click |
| [`../contracts/README.md`](../contracts/README.md) | Forge deploy & tests |
