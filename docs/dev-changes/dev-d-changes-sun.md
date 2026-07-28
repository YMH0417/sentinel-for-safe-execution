# Dev D 变更记录 — 2026-07-26（周日）

> **2026-07-28 追加**：Demo chain + Swap API 见 [`dev-d-changes-demo-chain.md`](dev-d-changes-demo-chain.md)。

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
