# Dev D 变更记录 — 2026-07-25（周六）

## 变更目的

根据 Dev A 新版 `VaultExecution` 的后端对接要求，将 Dev D 的执行服务从
mock 调用升级为基于 DevE 已签名 EIP-712 permit 的真实合约调用。

本次对应以下要求：

1. `/execute` 不再写死 `riskScore = 0` 或 `decision = ALLOW`。
2. 接收 DevE 的 evaluation 与 permit，读取链上 `nonces(user)` 后调用新版
   `executeRoute(...)`。
3. 将 `VaultExecuted` 映射为 `ExecutionSuccess`，将 `VaultRejected` 或
   `executed=false` 映射为 `ExecutionRejected`。
4. 使用 Vault ABI 解析 Solidity custom error。
5. 移除 `backend/src/services/vaultService.ts` 中的 mock 执行。

## 主要改动

### 1. 链配置与 nonce 查询

- 引入 ethers v6。
- 新增以下后端环境配置：
  - `RPC_URL`
  - `VAULT_EXECUTION_ADDRESS`
  - `EXECUTOR_PRIVATE_KEY`
- 新增 `GET /api/execute/nonce?user=0x...`。
- 通过只读 RPC 调用查询 `VaultExecution.nonces(user)`。
- nonce 和 chain ID 使用字符串返回，避免 JavaScript 大整数精度问题。

### 2. `/execute` 请求升级

`POST /api/execute` 现在接收：

- DevE evaluation
- EIP-712 `ExecutionPermit`
- 65-byte ECDSA signature

旧版 `{ routeId, maxLossBps, deadline }` 请求不再支持。

后端在发送交易前校验：

- user address
- routeId bytes32 编码
- amountIn / amountOutQuoted
- deadline
- riskScore
- decision 数值映射
- signature 格式
- evaluation 与 permit 一致性
- permit nonce 与链上 `nonces(user)` 一致性

### 3. 真实 Vault 调用

- 使用 ethers `JsonRpcProvider` 连接目标网络。
- 使用独立 Executor 账户提交 `VaultExecution.executeRoute(...)`。
- Executor 仅负责发送交易和支付 Gas，不是 DevE Agent signer。
- 移除 `setTimeout`、随机 txHash 和本地模拟执行结果。

### 4. 链上结果映射

- `VaultExecuted` → `ExecutionSuccess`
- `VaultRejected` → `ExecutionRejected`
- `executed=false` → `ExecutionRejected`
- 交易 receipt 中保存真实 txHash
- 通过 ABI 解析合约 custom error，包括 nonce、签名、deadline、暂停和损耗限制错误

### 5. Event Timeline

后端事件顺序统一为：

```text
RouteEvaluated → DecisionMade → ExecutionSuccess | ExecutionRejected | FallbackRequired
```

`FallbackRequired` 使用 `fallbackRouteId` 表示建议的安全路线，不表示 fallback
已经执行。

## 影响文件

| 文件 | 说明 |
|------|------|
| `backend/package.json` | 新增 ethers 依赖 |
| `backend/package-lock.json` | 锁定 ethers 依赖 |
| `backend/.env.example` | 新增链连接与 Executor 配置示例 |
| `backend/src/config/chainConfig.ts` | 链配置读取与校验 |
| `backend/src/services/chainService.ts` | ABI 加载与 nonce 查询 |
| `backend/src/services/vaultService.ts` | signed permit 真实合约调用、事件与 error 解析 |
| `backend/src/routes/execute.ts` | nonce endpoint、permit 请求校验与执行编排 |
| `backend/src/routes/evaluate.ts` | 增加 `RouteEvaluated` 事件 |
| `backend/src/services/eventService.ts` | 移除旧 mock full-flow 执行路径 |
| `backend/src/types.ts` | 增加 permit、合约 decision 和事件类型 |
| `shared/types/event.ts` | 同步统一事件合同 |
| `docs/api-contract.md` | 更新 `/execute`、nonce endpoint 和 Event 合同 |
| `docs/architecture.md` | 更新 Vault Service 与 Event Service 架构说明 |

## 验证

- [x] 后端 TypeScript production build 通过。
- [x] 旧版 `/execute` 请求返回 `400`。
- [x] evaluation 与 permit 不一致返回 `400`。
- [x] 非法 user address 返回 `400`。
- [x] 缺少链配置时返回明确错误。
- [x] 前端文件未修改。
- [ ] 使用 DevE 真实签名 permit 完成链上执行。
- [ ] 验证 nonce 重放保护。
- [ ] 验证真实合约 custom error 响应。

## 不在本次范围

- DevE permit 生成与 Agent signer 私钥管理。
- 前端 permit 获取、提交和 UI 展示。
- `VaultExecution` 部署。
- 真实链上端到端成功测试。
