# API Contract — Sentinel for Safe Execution v0.1

## Base URL

```
Backend:  http://localhost:8088/api
Frontend: http://localhost:3000/api/*  (proxied via Vite)
```

---

## 1. Get Quote

```http
GET /api/quote?tokenIn=USDT&tokenOut=USDC&amount=1000
```

**Response:**

```json
{
  "tokenIn": "USDT",
  "tokenOut": "USDC",
  "amountIn": 1000,
  "routes": [
    {
      "routeId": "route-a",
      "label": "Healthy SIA Route (Base↔Arbitrum)",
      "tokenIn": "USDT",
      "tokenOut": "USDC",
      "amountIn": 1000,
      "quotedOut": 998,
      "expectedOut": 1000,
      "poolRiskScore": 15,
      "historicalFailureRate": 0.02,
      "supportsFallback": false,
      "fallbackRouteId": null,
      "warningFlags": []
    }
  ]
}
```

---

## 2. Evaluate Route

```http
POST /api/evaluate
Content-Type: application/json

{
  "routeId": "route-b",
  "configProfile": "normal"
}
```

**Response:**

```json
{
  "decision": "REJECT",
  "riskScore": 95,
  "reason": "Risk score 95/100 exceeds 70 threshold. Flags: [quote_deviation, failure_risk, pool_risk]. Issues: quote deviation 8.0%; failure rate 45%; pool risk score 90",
  "routeId": "route-b",
  "fallbackRouteId": "route-a",
  "flags": ["quote_deviation", "failure_risk", "pool_risk"]
}
```

---

## 3. Execute Route

> ⚠️ 下方 HTTP 示例是当前 DevD 的 mock API。真实链上接入时，DevD 必须按照本节末的 DevA 合约接口传入 Agent 签名，不得写死 `ALLOW` 或 `riskScore = 0`。

```http
POST /api/execute
Content-Type: application/json

{
  "routeId": "route-a",
  "maxLossBps": 100,
  "deadline": 1721659999
}
```

### DevA 链上执行接口（后端迁移目标）

```solidity
executeRoute(
  address user,
  bytes32 routeId,
  uint256 amountIn,
  uint256 amountOutQuoted,
  uint256 deadline,
  uint256 riskScore,
  uint8 decision,
  uint256 nonce,
  bytes signature
) returns (bool executed)
```

- `decision`：`0 = ALLOW`、`1 = REJECT`、`2 = FALLBACK_TO_SAFE_ROUTE`。
- `signature`：DevE 使用 Agent signer 对 EIP-712 `ExecutionPermit` 签发的 65-byte 签名。
- `nonce`：调用前通过 `VaultExecution.nonces(user)` 获取。
- `executed = false` 且有 `VaultRejected`：业务拒绝；EVM revert：硬约束或签名校验失败。
- ABI 与完整 typed-data schema：`contracts/abi/VaultExecution.json`、`contracts/integration/execution-permit.json`。

**Response:**

```json
{
  "success": true,
  "event": {
    "id": "evt_1721659200000_1",
    "eventType": "ExecutionSuccess",
    "timestamp": 1721659200,
    "routeId": "route-a",
    "message": "Executed on-chain (mock). Tx: 0xabc123... Loss: 10bps",
    "txHash": "0xabc123def456..."
  }
}
```

---

## 4. Get Events

```http
GET /api/events
```

**Response:**

```json
{
  "events": [
    {
      "id": "evt_1",
      "eventType": "RouteEvaluated",
      "timestamp": 1721659190,
      "routeId": "route-a",
      "message": "Route route-a evaluated with USDT→USDC, amount=1000"
    },
    {
      "id": "evt_2",
      "eventType": "DecisionMade",
      "timestamp": 1721659195,
      "routeId": "route-a",
      "decision": "ALLOW",
      "riskScore": 20,
      "message": "Decision: ALLOW (riskScore=20). Risk score 20/100 is below threshold."
    },
    {
      "id": "evt_3",
      "eventType": "ExecutionSuccess",
      "timestamp": 1721659200,
      "routeId": "route-a",
      "message": "Executed on-chain (mock). Tx: 0xabc..."
    }
  ]
}
```

---

## Field Reference

### Route
| Field | Type | Description |
|-------|------|-------------|
| routeId | string | Unique identifier (route-a, route-b, route-c) |
| label | string | Human-readable name |
| tokenIn / tokenOut | string | Token symbols |
| amountIn | number | Input amount |
| quotedOut | number | Quoted output amount |
| expectedOut | number | Expected output amount |
| poolRiskScore | number | 0-100 risk score from pool analysis |
| historicalFailureRate | number | 0-1 historical failure rate |
| supportsFallback | boolean | Whether a fallback route exists |
| fallbackRouteId | string/null | ID of fallback route |
| warningFlags | string[] | List of risk flags |

### Decision
| Field | Type | Description |
|-------|------|-------------|
| decision | string | ALLOW | REJECT | FALLBACK_TO_SAFE_ROUTE |
| riskScore | number | 0-100 composite risk score |
| reason | string | Human-readable explanation |
| flags | string[] | Risk flag identifiers |
| fallbackRouteId | string/null | Target fallback route |
