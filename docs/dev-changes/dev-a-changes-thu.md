# Dev A 变更与交接记录 — 2026-07-23

> **2026-07-28 追加**：36 路由 demo 场景见 [`dev-a-changes-demo-chain.md`](dev-a-changes-demo-chain.md)。

> 给 Codex、CC、Cursor 与队友：本文件是当前合约版本的交接说明。后续任何 DevA 改动完成后，必须在文末追加变更记录。

## 本次交付

| 范围 | 状态 |
|---|:---:|
| `VaultExecution` 链上安全闸门 | ✅ |
| owner / Agent signer / nonce / EIP-712 permit | ✅ |
| Anvil 部署脚本与环境示例 | ✅ |
| 26 个 Foundry 测试 | ✅ |
| 本地真实部署与 `executeRoute` 调用 | ✅ |
| ABI 与 Agent 签名 schema | ✅ |

## 改动文件与影响

| 文件 | 内容 | 其他人需关注 |
|---|---|:---:|
| `contracts/src/VaultExecution.sol` | owner、Agent permit、nonce、ALLOW/REJECT/FALLBACK | ✅ |
| `contracts/script/DeployVaultExecution.s.sol` | 部署时设置 owner 与 agent signer | ✅ |
| `contracts/test/VaultExecution*.sol` | 基础、安全、拒绝、边界测试 | ❌ |
| `contracts/abi/VaultExecution.json` | 标准 ABI | ✅ |
| `contracts/integration/execution-permit.json` | EIP-712 schema 与编码约定 | ✅ |
| `contracts/deployments/anvil-31337.json` | 本地部署/冒烟记录，仅作本地参考，不提交 | ❌ |
| `contracts/.env.example` | 变量示例，不含真实密钥 | ✅ |

## ⚠️ 旧接口已废弃

旧版 `executeRoute` 允许调用方直接传入 decision/riskScore。新版必须传入 Agent 对所有参数的 EIP-712 签名：

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

| decision | 数值 | 合约结果 |
|---|---:|---|
| `ALLOW` | 0 | `VaultExecuted`，返回 `true` |
| `REJECT` | 1 | `VaultRejected`，返回 `false` |
| `FALLBACK_TO_SAFE_ROUTE` | 2 | 对最终安全 route 发 `VaultExecuted`，返回 `true` |

`riskScore >= 70` 也会拒绝。暂停、过期、超损耗、签名无效或 nonce 重放会 revert。

## Dev E：签名要求

- 完整 schema：`contracts/integration/execution-permit.json`。
- Domain：`Sentinel Vault Execution` / version `1`。
- `chainId` 和 `verifyingContract` 必须取当前运行网络与部署地址。
- 先读 `nonces(user)`，再签名。
- 签名格式必须是 65-byte `r || s || v`。
- fallback 必须签最终安全 route，而不是原高风险 route。
- Agent 私钥只保留在后端签名服务，绝不能放前端或提交进仓库。

## Dev D：后端要求

1. `/execute` 不得再写死 `riskScore = 0` 或 `decision = ALLOW`。
2. 接收 DevE 的评估与 permit，读取链上 `nonces(user)` 后调用新接口。
3. `VaultExecuted` 记为 `ExecutionSuccess`；`VaultRejected`/`executed=false` 记为 `ExecutionRejected`；revert 解析 custom error。
4. 当前 `backend/src/services/vaultService.ts` 仍是 mock，替换为真实链上调用属于 DevD。

## 前端要求

- 前端不保存、不生成 Agent 签名。
- `REJECT` 是合约成功返回 `false` 的业务拒绝；EVM revert 则展示为执行失败/拦截。
- 本地网络：`http://127.0.0.1:8545`，chain ID `31337`。

## 验证结果

| 项目 | 结果 |
|---|---|
| Foundry | `26 passed, 0 failed` |
| 本地地址 | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| 冒烟交易 | `0x1c96c3436b6433654150e45cda171b04bba4751c2dc2eb396a36f2c6acc37111` |
| 结果 | `0x1`，触发 `VaultExecuted`，nonce `0 → 1` |

Anvil 地址仅对相应本地实例有效；干净启动的默认 Anvil 会复现该首个部署地址。

## 提交白名单

应提交：

```text
contracts/src/VaultExecution.sol
contracts/script/DeployVaultExecution.s.sol
contracts/test/VaultExecution*.sol
contracts/.env.example
contracts/abi/VaultExecution.json
contracts/integration/execution-permit.json
contracts/README.md
docs/dev-a-changes-thu.md
```

绝不提交：`.env`、私钥/助记词、`contracts/out/`、`contracts/cache/`、`contracts/broadcast/`、`contracts/lib/`、`node_modules/`、`dist/`、临时日志和编辑器配置。

提交前：

```bash
git status --short
git diff --check
git add <白名单内的明确文件>
git diff --cached --stat
```

## 后续记录模板

```md
## YYYY-MM-DD — 标题
- 改动：
- 原因：
- 接口影响：有 / 无；说明：
- 其他人要做什么：
- 验证：命令与结果：
- 应提交文件：
- 不应提交文件：
```
