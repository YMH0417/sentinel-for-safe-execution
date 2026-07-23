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

```http
POST /api/execute
Content-Type: application/json

{
  "routeId": "route-a",
  "maxLossBps": 100,
  "deadline": 1721659999
}
```

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
