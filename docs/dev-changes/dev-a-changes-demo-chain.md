# Dev A 变更记录 — 36-Route Demo Scenario（2026-07-28）

> 追加于 [`dev-a-changes-thu.md`](dev-a-changes-thu.md)（VaultExecution 初版）。

## 本次交付

| 范围 | 状态 |
|------|:----:|
| 12 币对 × 3 池 = 36 路由 | ✅ |
| `DemoScenarioDeployer` 扩展部署 | ✅ |
| `DemoPoolRegistry` seal=36 + referencePoolByPair | ✅ |
| `DemoPair.swap()` Uniswap V2 风格 | ✅ |
| `fundSwapper()` 供 backend 测试 | ✅ |
| 价格比例 1:20:100:1 | ✅ |
| `SwapAll36Routes.t.sol` forge 36/36 | ✅ |
| `DeployAllDemo.s.sol` 一键部署 | ✅ |
| `TestAll36Swaps.s.sol` / `Verify36SwapsDeployed.s.sol` | ✅ |

## 改动文件

| 文件 | 内容 |
|------|------|
| `src/demo/DemoScenarioDeployer.sol` | 36 pool 部署与流动性 |
| `src/registry/DemoPoolRegistry.sol` | 36 池 seal、按 pair 查 reference |
| `src/dex/DemoPair.sol` | `swap(amount0Out, amount1Out, to)` |
| `script/DeployAllDemo.s.sol` | Anvil 一键 deploy + manifest |
| `script/TestAll36Swaps.s.sol` | 链上 36 swap 脚本 |
| `script/GenerateQuoteTables.s.sol` | 报价表输出 |
| `test/SwapAll36Routes.t.sol` | CI 回归 |
| `deployments/anvil-31337-demo.json` | 部署 manifest 模板 |

## 部署要求

```powershell
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000
forge script script/DeployAllDemo.s.sol:DeployAllDemo --rpc-url http://127.0.0.1:8545 --broadcast
```

默认 block gas 30M **不够** — 必须 `--block-gas-limit 120000000`。

## 对接 Backend

- Backend 读 `registry.deployer()` 获取 ScenarioDeployer 地址
- `fundSwapper(token, wallet, amount)` — demo swap 前置步骤
- Registry 地址写入 `DEMO_REGISTRY_ADDRESS` 或 deployment JSON

## 安全说明

- `fundSwapper` **无权限控制**，仅限本地 Anvil demo
- VaultExecution 仍独立，不执行 DEX swap

## 文档

[`contracts/README.md`](../../contracts/README.md)
