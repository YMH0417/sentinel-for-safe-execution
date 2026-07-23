# VaultExecution（DevA）

Week 3 MVP 的链上执行闸门。当前只校验并记录 route，不调用真实 DEX。

## 交付文件

- `abi/VaultExecution.json`：与当前编译产物一致的标准 JSON ABI。
- `integration/execution-permit.json`：DevD/DevE 使用的 EIP-712 schema、Decision 映射与编码约定。
- `deployments/anvil-31337.json`：本地部署和 `executeRoute` 冒烟测试记录（本地临时文件，不提交）。
- `deployments/monad-testnet-10143.json`：Monad Testnet 部署完成后生成。
- `../docs/dev-a-changes-thu.md`：DevA 变更、对接要求与提交白名单。

## 安全约束

- `paused`：仅 owner 可暂停或恢复。
- `maxLossBps`：仅 owner 可更新，范围为 `0-10000`。
- `deadline`：过期许可直接 revert。
- `agentSignature`：`decision`、`riskScore` 和 route 参数必须由 `agentSigner` 通过 EIP-712 签发。
- `nonce`：按用户递增，防止执行许可重放。
- `riskScore >= 70` 或 `decision == REJECT`：不执行，发出 `VaultRejected`。

## executeRoute 接口

```solidity
function executeRoute(
    address user,
    bytes32 routeId,
    uint256 amountIn,
    uint256 amountOutQuoted,
    uint256 deadline,
    uint256 riskScore,
    Decision decision,
    uint256 nonce,
    bytes calldata signature
) external returns (bool executed);
```

`Decision` 的 ABI 数值：

| 数值 | 决策 |
|---:|---|
| `0` | `ALLOW` |
| `1` | `REJECT` |
| `2` | `FALLBACK_TO_SAFE_ROUTE` |

对于 fallback，Agent/后端应传入最终安全 route 的 `routeId` 和报价，并对这组最终参数签名。

## EIP-712 签名

Domain：

```text
name: Sentinel Vault Execution
version: 1
chainId: 当前链 ID
verifyingContract: VaultExecution 部署地址
```

Primary type：

```text
ExecutionPermit(
  address user,
  bytes32 routeId,
  uint256 amountIn,
  uint256 amountOutQuoted,
  uint256 deadline,
  uint256 riskScore,
  uint8 decision,
  uint256 nonce
)
```

后端可调用 `getExecutionDigest(...)` 核对待签 digest，并通过 `nonces(user)` 获取当前 nonce。

## 构建和测试

```shell
forge build
forge test
```

## 部署

复制 `.env.example` 并设置：

- `PRIVATE_KEY`：部署账户私钥。
- `AGENT_SIGNER`：签发 ExecutionPermit 的 Agent 地址。
- `VAULT_ADMIN`：可选，默认使用部署账户。
- `MONAD_RPC_URL`：Monad Testnet RPC，默认使用官方公共端点。

```shell
forge script script/DeployVaultExecution.s.sol:DeployVaultExecution \
  --rpc-url <RPC_URL> \
  --broadcast
```

部署脚本会输出合约地址、owner、agent signer、max loss 和 paused 状态。

Monad Testnet：

```shell
source .env
forge script script/DeployVaultExecution.s.sol:DeployVaultExecution \
  --rpc-url "$MONAD_RPC_URL" \
  --broadcast
```

不要将 `.env`、私钥或签名服务密钥提交到 Git。
