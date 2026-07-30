# API Contract — Sentinel for Safe Execution v0.4

> **Last updated**: 2026-07-30
> Safe swap, structured JSONL evidence, and reusable data-analysis API.
> Legacy mock routes (`route-a/b/c`) unchanged in mock mode.

## Base URL

```text
Backend:  http://127.0.0.1:8080/api
Frontend: http://127.0.0.1:8081/api/*  (proxied via Vite)
```

## Chain Modes

| `CHAIN_MODE` | Quote | `/execute` | `/swap` |
|--------------|-------|------------|---------|
| `mock` | `routes.json` | In-process mock | 404 |
| `demo` | On-chain reserves | Vault if configured | Safe / force swap |
| unset / `rpc` | Config-dependent | Real Vault | 404 |

### Demo configuration

**Recommended:** run `.\start-demo.ps1` — auto-writes:

| File | Purpose |
|------|---------|
| `contracts/deployments/anvil-31337-demo.json` | registry, vault, swapRouter, tokens (forge) |
| `backend/.env` | addresses + keys (`scripts/sync-backend-env.ps1`) |

Backend loads `.env` via dotenv on startup. Fallback: `DEMO_DEPLOYMENT_PATH` → read vault/router from JSON.

Required for swap: `RPC_URL`, `DEMO_REGISTRY_ADDRESS` (or valid deployment file), `SWAP_PRIVATE_KEY` or Anvil #0 default.

Router one-tx swap additionally requires: `DEMO_SWAP_ROUTER_ADDRESS`, `VAULT_EXECUTION_ADDRESS`, `AGENT_PRIVATE_KEY` (must match Vault `agentSigner`).

---

## 0.1 Data Analysis

### GET /analysis

Analyzes `backend/data/events.jsonl` and returns:

```json
{
  "metadata": {
    "context": "sentinel-events",
    "definitionVersion": "1.0.0",
    "generatedAt": "2026-07-30T00:00:00.000Z",
    "sources": ["backend/data/events.jsonl"]
  },
  "quality": {
    "receivedRows": 100,
    "parsedRows": 99,
    "validRows": 97,
    "invalidRows": 2,
    "duplicateRows": 1,
    "validRate": 0.97,
    "issues": [],
    "coverage": {}
  },
  "summary": {
    "timeRange": null,
    "categoryCounts": {},
    "outcomeCounts": {},
    "uniqueEntities": 0,
    "uniqueActors": 0,
    "dimensionCounts": {},
    "metrics": {}
  },
  "trends": [],
  "entities": [],
  "insights": {
    "decisions": {},
    "fallback": {},
    "execution": {},
    "realizedSlippageBps": null,
    "evidence": {
      "readinessCriteria": {},
      "sufficientForHistoricalClaims": false,
      "assessment": "prototype-evidence-only"
    }
  }
}
```

Malformed JSONL lines appear in `quality.issues`; they are not silently
converted into valid records.

Operational decisions exclude standalone preview evaluations. Swap failure
insights separate Agent prevention, precondition failures, configuration
failures, and actual execution failures. Historical readiness requires safe
RPC activity; forced and demo events never qualify.

### GET /analysis/definition

Returns Sentinel's declarative field, dimension, and metric mapping.

### POST /analysis/run

Runs the reusable engine on caller-supplied records. It does not persist them.

```json
{
  "records": [
    {
      "id": "evt-1",
      "timestamp": 1785373200000,
      "eventType": "DecisionMade",
      "decision": "ALLOW"
    }
  ],
  "includeRecords": false
}
```

An optional `definition` object can map another project's field names. Maximum:
10,000 records. Every definition maps `id`, `timestamp`, and `category`;
`required` may add canonical fields but cannot remove those three.

Errors:

- invalid request → `400 INVALID_ANALYSIS_REQUEST`;
- invalid definition → `400 INVALID_ANALYSIS_DEFINITION`;
- too many records → `413 ANALYSIS_LIMIT_EXCEEDED`.

Full configuration and CLI documentation:
[`analysis-pipeline.md`](analysis-pipeline.md).

---

## 0. Health & Debug

### GET /health

```json
{ "status": "ok", "service": "sentinel-backend", "version": "0.1.0" }
```

### GET /debug/status

```json
{
  "service": "sentinel-backend",
  "version": "0.1.0",
  "chainMode": "demo",
  "rpcConfigured": true,
  "vaultConfigured": true,
  "swapConfigured": true,
  "routerSwapAvailable": true,
  "swapWallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "eventsPersistPath": "backend/data/events.jsonl",
  "demoRegistry": "0x603E1BD79259EbcbAaeD0c83eeC09cA0B89a5bcC",
  "demoPoolCount": 36,
  "routeCount": 36,
  "defaultProfile": "normal",
  "paused": false,
  "eventCount": 42,
  "endpoints": ["GET /api/health", "..."]
}
```

| Field | Description |
|-------|-------------|
| `routerSwapAvailable` | `true` when Router + Vault + Agent key configured |
| `eventsPersistPath` | JSONL file path for persisted events |

### GET /debug/pools-health

Demo mode only. Returns reserves and health for all 36 pools.

```json
{
  "registry": "0x603E...",
  "poolCount": 36,
  "healthy": 34,
  "degraded": 2,
  "empty": 0,
  "checkedAt": "2026-07-28T12:00:00.000Z",
  "pools": [
    {
      "routeId": "route-usdc-good-safe",
      "routeName": "route-usdc-good-safe",
      "pair": "0x8633...",
      "tokenIn": "USDC",
      "tokenOut": "GOOD",
      "poolLabel": "SAFE",
      "reserveInHuman": 1000000,
      "reserveOutHuman": 50000,
      "spotPrice": 0.05,
      "canSwap1Unit": true,
      "priceImpactBps1Unit": 0,
      "status": "healthy"
    }
  ]
}
```

`status`: `healthy` | `degraded` | `empty`.

404 when `CHAIN_MODE != demo`.

### GET /config

Optional query: `?profile=conservative|aggressive|normal`

```json
{
  "defaultProfile": "normal",
  "activeProfile": "normal",
  "paused": false,
  "profile": {
    "maxLossBps": 100,
    "maxQuoteDeviationThreshold": 0.008,
    "failureThreshold": 0.2,
    "poolRiskThreshold": 70,
    "maxSlippageBps": 100
  },
  "profiles": {},
  "decisionThresholds": {
    "allow": "riskScore < 40",
    "fallback": "40 <= riskScore < 70 and supportsFallback",
    "reject": "riskScore >= 70"
  }
}
```

Invalid profile → HTTP 400:

```json
{
  "error": {
    "code": "INVALID_CONFIG_PROFILE",
    "message": "profile must be normal, conservative, or aggressive"
  }
}
```

---

## 1. Get Quote

### GET /quote

```http
GET /api/quote?tokenIn=USDC&tokenOut=GOOD&amount=100
```

**Demo mode** — returns up to 3 routes (SAFE / SHALLOW / TOXIC) with live reserves:

```json
{
  "tokenIn": "USDC",
  "tokenOut": "GOOD",
  "amountIn": 100,
  "routes": [
    {
      "routeId": "route-usdc-good-safe",
      "label": "USDC → GOOD @ SAFE Pool",
      "tokenIn": "USDC",
      "tokenOut": "GOOD",
      "amountIn": 100,
      "quotedOut": 4.9845,
      "expectedOut": 5.0,
      "poolRiskScore": 15,
      "historicalFailureRate": 0.02,
      "supportsFallback": false,
      "fallbackRouteId": null,
      "warningFlags": []
    },
    {
      "routeId": "route-usdc-good-shallow",
      "label": "USDC → GOOD @ SHALLOW Pool",
      "quotedOut": 4.1562,
      "expectedOut": 5.0,
      "poolRiskScore": 72,
      "historicalFailureRate": 0.25,
      "supportsFallback": true,
      "fallbackRouteId": "route-usdc-good-safe",
      "warningFlags": ["shallow_pool", "high_price_impact"]
    }
  ]
}
```

**Mock mode** — filters `shared/demo-data/routes.json` (legacy `route-a/b/c`, USDT/USDC).

Errors: demo RPC/registry failure → `503`.

### GET /quote/route/:routeId

```http
GET /api/quote/route/route-usdc-good-safe?amount=100
```

Optional query: `tokenIn`, `tokenOut`, `amount`.

```json
{
  "route": { "routeId": "route-usdc-good-safe", "...": "..." }
}
```

404 if route not found.

---

## 2. Evaluate Route

```http
POST /api/evaluate
Content-Type: application/json

{
  "routeId": "route-usdc-good-safe",
  "configProfile": "normal",
  "tokenIn": "USDC",
  "tokenOut": "GOOD",
  "amountIn": 100
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `routeId` | yes | Mock: `route-a` etc. Demo: `route-usdc-good-safe` etc. |
| `configProfile` | no | `normal` (default), `conservative`, `aggressive` |
| `tokenIn` / `tokenOut` / `amountIn` | no | Used to load live quote in demo mode |

**Response:**

```json
{
  "decision": "ALLOW",
  "riskScore": 0,
  "reason": "风险评分 0/100，低于执行阈值，可以放行。",
  "reasonTechnical": "allow: score=0, flags=[]",
  "routeId": "route-usdc-good-safe",
  "fallbackRouteId": null,
  "flags": [],
  "correlationId": "18fe0daf-a760-4d75-a75e-80e907e77d69"
}
```

**Demo hard reject** (tokenOut = BAD or BAIT):

```json
{
  "decision": "REJECT",
  "riskScore": 100,
  "reason": "目标资产被标记为高风险代币（BAD），即使池子流动性正常也应拒绝执行。",
  "reasonTechnical": "token_risk: tokenOut=BAD, registryRiskTag=...",
  "routeId": "route-usdc-bad-safe",
  "fallbackRouteId": null,
  "flags": ["high_token_risk"]
}
```

Side effect: emits `RouteEvaluated` and `DecisionMade` events (persisted to JSONL).
Pass the returned `correlationId` back inside `evaluation` when calling
`POST /execute`; the execute endpoint reuses valid UUIDs so the two phases join
into one analyzed operation.

**Legacy mock examples:**

| routeId | decision | riskScore |
|---------|----------|-----------|
| route-a | ALLOW | 0 |
| route-b | REJECT | 95 |
| route-c | FALLBACK_TO_SAFE_ROUTE | 60 |

---

## 3. Execute Route (Vault Gate)

> Does **not** perform DEX swap. Validates Agent-signed EIP-712 permit on `VaultExecution`.

### POST /execute

```http
POST /api/execute
Content-Type: application/json

{
  "evaluation": {
    "decision": "ALLOW",
    "riskScore": 20,
    "reason": "Route is safe to execute.",
    "routeId": "route-a",
    "fallbackRouteId": null,
    "flags": [],
    "correlationId": "18fe0daf-a760-4d75-a75e-80e907e77d69"
  },
  "permit": {
    "user": "0x1111111111111111111111111111111111111111",
    "routeId": "0x726f7574652d610000000000000000000000000000000000000000000000000000",
    "amountIn": "1000",
    "amountOutQuoted": "998",
    "deadline": "1721659999",
    "riskScore": "20",
    "decision": 0,
    "nonce": "3"
  },
  "signature": "0x<65-byte EIP-712 signature>"
}
```

### Request rules

- `permit.routeId` — UTF-8 route ID as `bytes32`, zero-padded.
- All `uint256` fields as **decimal strings**.
- `permit.decision`: `0 = ALLOW`, `1 = REJECT`, `2 = FALLBACK_TO_SAFE_ROUTE`.
- Backend re-reads `VaultExecution.nonces(permit.user)`; does not trust client nonce.
- `evaluation` must match signed permit fields.

**Mock mode** (`CHAIN_MODE=mock`):

- Legacy body `{ "routeId": "route-a" }` still accepted.
- Dummy 65-byte signature accepted; no RPC.

### GET /execute/nonce

```http
GET /api/execute/nonce?user=0x1111111111111111111111111111111111111111
```

```json
{
  "user": "0x1111...",
  "nonce": "3",
  "chainId": "31337",
  "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
}
```

| Status | Condition |
|--------|-----------|
| 400 | Invalid user address |
| 502 | RPC error |
| 503 | Missing RPC / Vault address |

Schema: `contracts/integration/execution-permit.json`, ABI: `contracts/abi/VaultExecution.json`.

---

## 4. Demo Metadata (demo mode only)

Returns `404` when `CHAIN_MODE != demo`.

### GET /demo/tokens

```json
{
  "tokens": [
    {
      "symbol": "USDC",
      "name": "USD Coin",
      "address": "0xa16E...",
      "decimals": 6,
      "riskTag": "NONE",
      "registryRiskTag": 0
    }
  ],
  "priceRatio": "USDC:GOOD:BAD:BAIT = 1:20:100:1"
}
```

### GET /demo/pools

```json
{
  "registry": "0x603E...",
  "poolCount": 36,
  "isSealed": true,
  "pools": [
    {
      "routeId": "route-usdc-good-safe",
      "routeName": "route-usdc-good-safe",
      "pair": "0x8633...",
      "tokenIn": "USDC",
      "tokenOut": "GOOD",
      "tokenInAddress": "0xa16E...",
      "tokenOutAddress": "0xB7A5...",
      "label": 0,
      "poolLabel": "SAFE",
      "isReferencePool": true
    }
  ]
}
```

### GET /demo/status

```json
{
  "registry": "0x603E...",
  "poolCount": 36,
  "tokens": { "USDC": "0x...", "GOOD": "0x...", "BAD": "0x...", "BAIT": "0x..." },
  "priceRatio": "USDC:GOOD:BAD:BAIT = 1:20:100:1",
  "swapReady": true,
  "swapWallet": "0xf39F...",
  "swapEndpoints": ["POST /api/swap", "POST /api/swap/safe", "POST /api/swap/force", "..."]
}
```

---

## 5. Swap (demo mode only)

Real on-chain swap via `DemoPair`. Requires `CHAIN_MODE=demo`.

### POST /swap  or  POST /swap/safe  (default product path)

```http
POST /api/swap/safe
Content-Type: application/json

{
  "routeId": "route-usdc-good-shallow",
  "amountIn": 100,
  "recipient": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "configProfile": "normal"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `routeId` | yes | One of 36 demo routes |
| `amountIn` | yes | Human amount (respects token decimals) |
| `recipient` | no | Defaults to swap wallet |
| `configProfile` | no | Passed to Agent (default `normal`) |

**Pipeline:**

1. `evaluateRoute(routeId)` → ALLOW | REJECT | FALLBACK_TO_SAFE_ROUTE
2. If FALLBACK → re-evaluate and execute on `route-{in}-{out}-safe`
3. Re-quote; enforce `maxSlippageBps` from risk-config (default 100 = 1%)
4. Execute:
   - **Router mode** (`routerSwapAvailable`): `DemoSwapRouter.swapWithPermit` — Vault + fund + swap in **1 tx**
   - **Direct mode**: `fundSwapper` → `token.transfer(pair)` → `pair.swap()` — **3 tx**

**Success response:**

```json
{
  "success": true,
  "routeId": "route-usdc-good-safe",
  "requestedRouteId": "route-usdc-good-shallow",
  "executedRouteId": "route-usdc-good-safe",
  "agentDecision": "FALLBACK_TO_SAFE_ROUTE",
  "executionMode": "router",
  "tokenIn": "USDC",
  "tokenOut": "GOOD",
  "amountIn": 100,
  "quotedOut": 4.9845,
  "amountOutMin": 4.934655,
  "slippageBps": 100,
  "actualOut": 4.9845,
  "recipient": "0xf39F...",
  "pairAddress": "0x8633...",
  "txHash": "0x75f7...",
  "blockNumber": 7,
  "gasUsed": "74473",
  "balancesBefore": { "USDC": { "human": 3, "raw": "...", "symbol": "USDC", "address": "0x..." } },
  "balancesAfter": { "GOOD": { "human": 0.0498, "...": "..." } },
  "balanceDelta": { "USDC": 0, "GOOD": 4.9845 }
}
```

| Status | Condition |
|--------|-----------|
| 400 | Invalid request / route |
| 409 | `SLIPPAGE_EXCEEDED` — re-quote below minimum |
| 422 | `SWAP_REJECTED_BY_AGENT` |
| 502 | RPC / tx failure |
| 503 | Swap not configured |

### POST /swap/force

Bypasses Agent evaluation. Use for development and batch verification.

```http
POST /api/swap/force
Content-Type: application/json

{ "routeId": "route-usdc-bad-safe", "amountIn": 1 }
```

Same response shape as safe swap; `agentDecision` omitted; `requestedRouteId` equals `executedRouteId`.

> Legacy field `skipEvaluate: true` on `POST /api/swap` is deprecated — use `/swap/force`.

### POST /swap/verify-all

```http
POST /api/swap/verify-all
Content-Type: application/json

{ "amountIn": 1, "recipient": "0x..." }
```

| Field | Default | Notes |
|-------|---------|-------|
| `amountIn` | `1` | Per-route input amount |
| `safe` | `false` | Set `"safe": true` to use Agent (BAD/BAIT out will REJECT) |
| `recipient` | swap wallet | Optional |

Defaults to **force** mode (36/36 expected).

```json
{
  "passed": 36,
  "failed": 0,
  "total": 36,
  "amountIn": 1,
  "mode": "force",
  "routerAvailable": true,
  "recipient": "0xf39F...",
  "results": [
    {
      "routeId": "route-usdc-good-safe",
      "requestedRouteId": "route-usdc-good-safe",
      "txHash": "0x...",
      "tokenIn": "USDC",
      "tokenOut": "GOOD",
      "actualOut": 0.0498,
      "executionMode": "router"
    }
  ],
  "errors": []
}
```

### GET /swap/wallet

```json
{
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "routerAvailable": true,
  "hint": "Default recipient when POST /api/swap omits recipient"
}
```

### GET /swap/balances

### GET /swap/balances/:address

```json
{
  "address": "0xf39F...",
  "balances": {
    "USDC": { "symbol": "USDC", "address": "0x...", "raw": "394826294", "human": 394.826294 },
    "GOOD": { "...": "..." },
    "BAD": { "...": "..." },
    "BAIT": { "...": "..." }
  }
}
```

Swap wallet: `SWAP_PRIVATE_KEY` or `EXECUTOR_PRIVATE_KEY` or Anvil account #0.

---

## 6. Events

Events are **persisted** to `backend/data/events.jsonl` and loaded into memory on startup.

### GET /events

```json
{
  "events": [
    {
      "id": "evt_1",
      "eventType": "RouteEvaluated",
      "timestamp": 1721659190000,
      "routeId": "route-usdc-good-safe",
      "message": "Route route-usdc-good-safe submitted for safety evaluation"
    },
    {
      "id": "evt_2",
      "eventType": "FallbackRequired",
      "timestamp": 1721659195000,
      "routeId": "route-usdc-good-shallow",
      "fallbackRouteId": "route-usdc-good-safe",
      "message": "Fallback to route-usdc-good-safe"
    },
    {
      "id": "evt_3",
      "eventType": "SwapExecuted",
      "timestamp": 1721659200000,
      "routeId": "route-usdc-good-safe",
      "message": "Swap USDC→GOOD mode=router out=4.9845",
      "txHash": "0x75f7..."
    }
  ]
}
```

### POST /events/clear

Clears **both** in-memory log and JSONL file (development).

### Event types

| eventType | When |
|-----------|------|
| `RouteEvaluated` | POST /evaluate or safe swap pre-check |
| `DecisionMade` | Agent finished |
| `FallbackRequired` | Safe swap switched to fallback route |
| `ExecutionSuccess` | Vault ALLOW executed |
| `ExecutionRejected` | Vault REJECT / gate block |
| `SwapExecuted` | POST /swap success |
| `SwapFailed` | POST /swap error |
| `SwapBatchCompleted` | POST /swap/verify-all finished |

### Safe swap timeline

```text
RouteEvaluated → DecisionMade → [FallbackRequired] → SwapExecuted | SwapFailed
```

`SwapFailed.context.failureStage` is one of `evaluation`, `precondition`,
`configuration`, or `execution`. Agent rejection also sets
`context.prevented=true`; it is not counted as a failed on-chain execution.

### Vault timeline (standalone execute)

```text
RouteEvaluated → DecisionMade → ExecutionSuccess | ExecutionRejected
```

`FALLBACK_TO_SAFE_ROUTE` on execute switches to `fallbackRouteId` and ends in
`ExecutionSuccess` when the Vault gate passes.

**Vault FALLBACK example:**

```json
{
  "id": "evt_1721659200000_3",
  "eventType": "ExecutionSuccess",
  "timestamp": 1721659200000,
  "routeId": "route-a",
  "decision": "FALLBACK_TO_SAFE_ROUTE",
  "riskScore": 60,
  "fallbackRouteId": "route-a",
  "message": "Executed successfully in local mock chain mode"
}
```

---

## Error Contract

All API errors use structured JSON:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Human-readable error message"
  }
}
```

| HTTP | When |
|------|------|
| 400 | Invalid params, malformed JSON (`INVALID_JSON`), validation errors |
| 404 | Unknown endpoint (`NOT_FOUND`) or route not found |
| 409 | Slippage exceeded (`SLIPPAGE_EXCEEDED`) |
| 422 | Agent or Vault rejection |
| 500 | Unhandled server error (no stack trace in response) |
| 502 | RPC / chain query failure |
| 503 | Missing chain configuration or evaluate/quote unavailable |

Common error codes:

| code | Endpoint |
|------|----------|
| `INVALID_QUOTE_REQUEST` | GET /quote |
| `INVALID_EVALUATE_REQUEST` | POST /evaluate |
| `INVALID_EXECUTION_REQUEST` | POST /execute |
| `INVALID_CONFIG_PROFILE` | GET /config |
| `INVALID_USER_ADDRESS` | GET /execute/nonce |
| `SWAP_REJECTED_BY_AGENT` | POST /swap/safe |
| `SLIPPAGE_EXCEEDED` | POST /swap/safe |

Swap rejection example:

```json
{
  "error": {
    "code": "SWAP_REJECTED_BY_AGENT",
    "message": "...",
    "details": { "decision": { "...": "..." } }
  }
}
```

---

## Field Reference

### Route

| Field | Type | Description |
|-------|------|-------------|
| routeId | string | Mock: `route-a`. Demo: `route-usdc-good-safe` |
| label | string | Human-readable name |
| tokenIn / tokenOut | string | Symbol |
| amountIn | number | Input amount |
| quotedOut | number | Quoted output |
| expectedOut | number | Spot / fair value reference |
| poolRiskScore | number | 0–100 |
| historicalFailureRate | number | 0–1 |
| supportsFallback | boolean | Has SAFE fallback route |
| fallbackRouteId | string \| null | e.g. `route-usdc-good-safe` |
| warningFlags | string[] | e.g. `toxic_pool`, `shallow_pool`, `high_price_impact` |

### Decision

| Field | Type | Description |
|-------|------|-------------|
| decision | string | `ALLOW` \| `REJECT` \| `FALLBACK_TO_SAFE_ROUTE` |
| riskScore | number | 0–100 |
| reason | string | User-facing |
| reasonTechnical | string | Debug breakdown |
| flags | string[] | Triggered rule flags |
| fallbackRouteId | string \| null | Suggested safe route |

### SwapResult

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always true on 200 |
| routeId | string | Alias for `executedRouteId` |
| requestedRouteId | string | Original request route |
| executedRouteId | string | Route actually swapped (after fallback) |
| agentDecision | string | Agent decision (safe swap only) |
| executionMode | string | `router` \| `direct` |
| quotedOut | number | Pre-swap quote |
| amountOutMin | number | Minimum acceptable output (slippage guard) |
| slippageBps | number | Applied slippage tolerance |
| actualOut | number | tokenOut balance increase on recipient |
| balanceDelta | object | Per-symbol human delta |
| txHash | string | Final swap tx |

### Event

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique event identifier |
| eventType | string | See event types table above |
| timestamp | number | Unix timestamp in milliseconds |
| routeId | string | Route that produced the event |
| decision | string (optional) | Agent decision when applicable |
| riskScore | number (optional) | Risk score when applicable |
| fallbackRouteId | string (optional) | Safe route selected for fallback |
| message | string | Human-readable event explanation |
| txHash | string (optional) | Confirmed on-chain transaction hash |
