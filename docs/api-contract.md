# API Contract — Sentinel for Safe Execution v0.1

## Base URL

```
Backend:  http://127.0.0.1:8080/api
Frontend: http://127.0.0.1:8081/api/*  (proxied via Vite)
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

> 本接口只接受 DevE 已签名的完整 EIP-712 permit。后端会核对请求、读取链上
> nonce，并调用真实 `VaultExecution.executeRoute`。运行前必须配置 RPC、合约
> 地址和 Executor 私钥。

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
    "flags": []
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

- `evaluation` 是 DevE 对本次 route 的评估结果。
- `permit` 是 DevE 实际签名的 EIP-712 `ExecutionPermit` message。
- `signature` 必须是 65-byte ECDSA `r || s || v`，其中 `v` 为 27 或 28。
- `permit.routeId` 是 route ID 的 UTF-8 `bytes32` 编码，右侧补零。
- 所有 `uint256` 字段均使用十进制字符串传输，避免 JavaScript 数字精度丢失。
- `permit.decision` 映射为：`ALLOW = 0`、`REJECT = 1`、`FALLBACK_TO_SAFE_ROUTE = 2`。
- 后端必须重新读取 `VaultExecution.nonces(permit.user)`，不得信任请求中的 nonce。
- `evaluation.routeId`、risk score 和 decision 必须与 permit 一致。
- 后端不生成 DevE 签名，也不保存 DevE Agent signer 私钥。
- fallback permit 必须签最终安全 route 的参数，不得签原高风险 route。

### Read Permit Nonce

DevE 在签发 permit 前通过 DevD 查询用户当前的合约 nonce：

```http
GET /api/execute/nonce?user=0x1111111111111111111111111111111111111111
```

```json
{
  "user": "0x1111111111111111111111111111111111111111",
  "nonce": "3",
  "chainId": "31337",
  "contractAddress": "0x5FbDB2315678afecb367f032d93F642f64180aa3"
}
```

- 该接口通过 JSON-RPC `eth_call` 调用 `VaultExecution.nonces(user)`。
- 查询不会发送交易、消耗 Gas、修改链上状态或使用交易私钥。
- `nonce` 和 `chainId` 使用字符串返回。
- 后端需要配置 `RPC_URL` 和 `VAULT_EXECUTION_ADDRESS`。
- RPC 不可用返回 `502`；链配置缺失返回 `503`；user 地址非法返回 `400`。

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

**Response (ALLOW):**

```json
{
  "success": true,
  "event": {
    "id": "evt_1721659200000_1",
    "eventType": "ExecutionSuccess",
    "timestamp": 1721659200,
    "routeId": "route-a",
    "decision": "ALLOW",
    "riskScore": 0,
    "message": "VaultExecuted on-chain in block 12345",
    "txHash": "0xabc123def456..."
  },
  "decision": {
    "decision": "ALLOW",
    "riskScore": 0,
    "reason": "Risk score 0/100 is below threshold...",
    "routeId": "route-a",
    "fallbackRouteId": null,
    "flags": []
  }
}
```

**Response (REJECT / FALLBACK_TO_SAFE_ROUTE):**

```json
{
  "success": false,
  "event": {
    "id": "evt_1721659200000_2",
    "eventType": "ExecutionRejected",
    "timestamp": 1721659200,
    "routeId": "route-b",
    "decision": "REJECT",
    "riskScore": 95,
    "message": "Execution blocked by Safety Agent gate. Decision: REJECT, RiskScore: 95. ..."
  },
  "decision": {
    "decision": "REJECT",
    "riskScore": 95,
    "reason": "Risk score 95/100 exceeds 70 threshold...",
    "routeId": "route-b",
    "fallbackRouteId": "route-a",
    "flags": ["quote_deviation", "failure_risk", "pool_risk"]
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
      "message": "VaultExecuted on-chain in block 12345"
    }
  ]
}
```

### Timeline Contract

一次标准流程固定按以下顺序产生事件：

```text
RouteEvaluated → DecisionMade → ExecutionSuccess | ExecutionRejected | FallbackRequired
```

- `RouteEvaluated`：`POST /api/evaluate` 收到 route 后产生。
- `DecisionMade`：Safety Agent 完成确定性判断后产生。
- `ExecutionSuccess`：ALLOW route 通过执行闸门并成功执行。
- `ExecutionRejected`：REJECT route 被执行闸门拦截。
- `FallbackRequired`：当前 route 不执行，调用方应根据 `fallbackRouteId` 重新评估并执行安全路线。
- 系统不会把 `FallbackRequired` 表示成已经执行 fallback，也不使用 `FallbackTriggered`。
- `GET /api/events` 返回后端内存中按发生顺序排列的真实事件；服务重启后事件清空。

**FALLBACK event example:**

```json
{
  "id": "evt_1721659200000_3",
  "eventType": "FallbackRequired",
  "timestamp": 1721659200000,
  "routeId": "route-c",
  "decision": "FALLBACK_TO_SAFE_ROUTE",
  "riskScore": 60,
  "fallbackRouteId": "route-a",
  "message": "Execution requires fallback from route-c to route-a"
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

### Event
| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique event identifier |
| eventType | string | RouteEvaluated, DecisionMade, ExecutionSuccess, ExecutionRejected, or FallbackRequired |
| timestamp | number | Unix timestamp in milliseconds |
| routeId | string | Route that produced the event |
| decision | string/optional | Agent decision when applicable |
| riskScore | number/optional | Risk score when applicable |
| fallbackRouteId | string/optional | Suggested safe route for FallbackRequired |
| message | string | Human-readable event explanation |
| txHash | string/optional | Confirmed on-chain transaction hash |
