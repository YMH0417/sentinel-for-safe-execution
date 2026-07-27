# Dev D 变更记录 — 2026-07-26（周日）

## 变更目的

为优先完成 Week 3 前后端 Demo 联调，增加显式本地 mock chain 模式，使前端无需
启动 Anvil、部署合约或配置真实签名即可调用 nonce 和 execute 接口。

真实 RPC 与合约执行逻辑继续保留；只有设置 `CHAIN_MODE=mock` 时才启用模拟行为。

## 主要改动

### 1. 显式 chain mode

- 新增 `CHAIN_MODE=mock` 配置。
- 未设置为 `mock` 时继续使用原有真实 RPC 模式。
- 后端启动日志会显示当前为 `mock` 或 `rpc` 模式。

### 2. Mock nonce

`GET /api/execute/nonce?user=0x...` 在 mock 模式下：

- 不连接 RPC。
- 返回进程内 nonce。
- 返回本地演示 chain ID `31337`。
- 返回本地演示合约地址。

### 3. Mock execution

`POST /api/execute` 在 mock 模式下：

- 支持新版 `{ evaluation, permit, signature }` 请求。
- dummy 65-byte signature 仅校验格式，不验证真实 EIP-712 签名。
- 根据 decision 返回模拟 `ExecutionSuccess` 或 `ExecutionRejected`。
- 成功处理新版 permit 后递增对应用户的进程内 nonce。
- 临时兼容当前 master 前端的旧版
  `{ routeId, maxLossBps, deadline }` 请求，方便前端 PR 合并前演示。

## 影响文件

| 文件 | 说明 |
|---|---|
| `backend/src/services/mockChainService.ts` | mock nonce、执行结果及交易哈希 |
| `backend/src/config/chainConfig.ts` | 判断 `CHAIN_MODE=mock` |
| `backend/src/routes/execute.ts` | nonce 与 execute 的 mock 分支 |
| `backend/src/index.ts` | 输出当前 chain mode |
| `backend/.env.example` | 增加 mock 配置示例 |
| `README.md` | 增加无需 Anvil 的本地 Demo 启动步骤 |
| `docs/api-contract.md` | 说明 mock 模式的行为与限制 |

## 本地启动

```powershell
cd backend
$env:CHAIN_MODE = "mock"
npm.cmd run dev
```

另开终端：

```powershell
cd frontend
npm.cmd run dev
```

前端访问 `http://127.0.0.1:8081`，Vite 会将 `/api` 转发到
`http://127.0.0.1:8080`。

## 验证结果

- [x] 后端 TypeScript production build 通过。
- [x] 前端 TypeScript 与 Vite production build 通过。
- [x] 后端 health 接口通过。
- [x] mock nonce 接口返回 nonce `0` 和 chain ID `31337`。
- [x] 当前 master 前端旧版 execute 请求返回 `ExecutionSuccess`。
- [x] 新版 permit execute 请求使用 dummy 65-byte signature 返回
      `ExecutionSuccess`。
- [x] 通过前端 Vite `/api` 代理完成 health、nonce 和 execute 请求。

## 限制

- mock 数据仅保存在后端进程内，重启后 nonce 重置。
- mock 模式不验证 EIP-712 签名、防重放安全性或真实交易 receipt。
- 真实 Anvil 联调仍需配置 `RPC_URL`、`VAULT_EXECUTION_ADDRESS` 和
  `EXECUTOR_PRIVATE_KEY`，并使用真实 Agent signer 签名。

---

## 变更补充

### 完成事项

- `/api/quote` 增加币种与正数金额校验。
- `/api/evaluate` 增加 `routeId` 类型和 `configProfile` 白名单校验。
- `/api/config` 的非法 profile 响应统一为结构化错误。
- `/api/execute/nonce` 的地址、链配置和查询错误统一为结构化错误。
- 增加全局 JSON 错误处理，覆盖非法 JSON、未知 endpoint 和未捕获异常。
- `docs/api-contract.md` 补充 `/api/config`、`/api/debug/status` 和统一错误合同。
- API contract 与 architecture 统一 fallback 口径：安全 route 执行成功后产生
  `ExecutionSuccess`，`FallbackRequired` 仅作为兼容事件类型保留。

### 影响文件

| 文件 | 说明 |
|---|---|
| `backend/src/middleware/errorHandler.ts` | JSON 404、非法 JSON 与全局异常处理 |
| `backend/src/index.ts` | 注册全局错误处理中间件 |
| `backend/src/routes/quote.ts` | quote 请求校验 |
| `backend/src/routes/evaluate.ts` | evaluate 请求校验 |
| `backend/src/routes/config.ts` | config 错误合同统一 |
| `backend/src/routes/execute.ts` | nonce 查询错误合同统一 |
| `docs/api-contract.md` | config、debug、error 和 fallback 合同 |
| `docs/architecture.md` | Timeline 口径同步 |

### 验收结果

- [x] 后端 TypeScript production build 通过。
- [x] `route-a` 返回 `ExecutionSuccess(route-a)`。
- [x] `route-b` 返回 `ExecutionRejected(route-b)`。
- [x] `route-c` 返回 `ExecutionSuccess(route-a)`。
- [x] `/api/debug/status` 正确返回 mock 与 route 数据状态。
- [x] 非法 quote 金额、evaluate 请求、config profile 和 nonce user 均返回
  HTTP 400 JSON。
- [x] 非法 JSON 返回 HTTP 400 JSON。
- [x] 未知 endpoint 返回 HTTP 404 JSON。
- [x] Debug status 不包含 RPC URL、私钥、签名或请求体。

### 注意事项

- `/api/quote` 要求提供非空 `tokenIn`、`tokenOut` 和正数 `amount`。
- `configProfile` 仅接受 `normal`、`conservative` 和 `aggressive`。
- `/api/events` 与 mock nonce 是进程内数据，后端重启后会重置。
- 全局 HTTP 500 响应不返回内部错误堆栈；详细异常只写入后端控制台。
