# Contracts — Sentinel Demo + VaultExecution

> **Last updated**: 2026-08-02

Solidity **0.8.24**, Foundry. Two deployment tracks:

1. **VaultExecution** — EIP-712 execution gate (production path)
2. **Demo scenario** — **48 pools** (12 pairs × SAFE/SHALLOW/TOXIC/SDA), 4 tokens, real swaps on Anvil (+ DemoSwapRouter)

Profile 定义：[`shared/demo-chain-profiles.json`](../shared/demo-chain-profiles.json)

| Profile | Chain ID | Manifest | `deploymentTarget` |
|---------|----------|----------|-------------------|
| `anvil-local` | **31337** | `local-31337-demo.json` | `local` |
| `anvil-fork-monad` | **10143** | `local-10143-demo.json` | `local` |
| `monad-testnet` | **10143** | `monad-10143-demo.json` | `remote` |

---

## Quick start (Windows, recommended)

```powershell
# 本地开发 — Anvil @31337（MetaMask「Anvil Local」）
.\start-demo.ps1 -Profile anvil-local -VerifySwaps

# Fork Monad testnet 状态 — Anvil @10143 + MON
.\start-demo.ps1 -Profile anvil-fork-monad -VerifySwaps

# 公网 Monad testnet
.\scripts\deploy-monad-testnet.ps1 -Verify
```

Or deploy only (manual):

```powershell
# Local 31337
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000
cd contracts
$env:DEMO_PROFILE = "anvil-local"
forge script script/DeployAllDemo.s.sol:DeployAllDemo `
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv
powershell -ExecutionPolicy Bypass -File ../scripts/sync-backend-env.ps1 -Profile anvil-local
```

> Anvil 重启后重新运行 `.\start-demo.ps1` 即可 redeploy + 重写 `.env`。  
> Legacy 文件名 `anvil-31337-demo.json` 仅作 fallback；新部署写入 `local-31337-demo.json` 或 `local-10143-demo.json`。

---

## Demo 48-Route Scenario

### Local — `anvil-local` (31337)

Manifest: **`deployments/local-31337-demo.json`** — native **ETH**, 与 MetaMask 默认 Anvil 网络一致。

### Local fork — `anvil-fork-monad` (10143)

```powershell
.\start-demo.ps1 -Profile anvil-fork-monad
# Anvil: --fork-url https://testnet-rpc.monad.xyz --chain-id 10143
```

Manifest: **`deployments/local-10143-demo.json`** — native **MON**；与公网 testnet 同 chainId，但合约为本地新部署地址。

### Monad testnet (10143, remote)

Per-tx gas cap **30M**. Phased deploy gas (local fork / remote 相同):

| Phase | Call | ~Gas |
|-------|------|------|
| 0 | `new DemoScenarioDeployer()` | ~6.5M |
| 1 | `beginScenario()` — tokens + registry | ~5M |
| 2 | `deployPoolBatch(12)` × 4 | ~16–18M each |
| 3 | `sealScenario()` | ~90K |
| + | Vault, Router, auth, fund test user | ~1–2M each |

```powershell
# 1. Copy and fill contracts/.env (PRIVATE_KEY, optional AGENT_SIGNER / MONADSCAN_API_KEY)
Copy-Item contracts\.env.example contracts\.env

# 2. Deploy (~17 txs)
.\scripts\deploy-monad-testnet.ps1 -Verify

# 3. Set remote wallet keys in backend/.env + DEMO_PROFILE=monad-testnet
.\scripts\switch-demo-profile.ps1 -Profile monad-testnet
```

Manifest: **`deployments/monad-10143-demo.json`** (`deploymentTarget: "remote"`).

Foundry RPC alias: `forge script ... --rpc-url monad_testnet` (reads `MONAD_RPC_URL` from env).

### Deploy output

Forge 按 profile 写入 manifest（池列表由链上 registry 读取，`pools: []` 正常）：

| Profile | 文件 | 典型 `chainId` |
|---------|------|----------------|
| `anvil-local` | `local-31337-demo.json` | 31337 |
| `anvil-fork-monad` | `local-10143-demo.json` | 10143 |
| `monad-testnet` | `monad-10143-demo.json` | 10143 |

```json
{
  "chainId": 31337,
  "network": "anvil-local",
  "deploymentTarget": "local",
  "profile": "anvil-local",
  "registry": "0x...",
  "vaultExecution": "0x...",
  "swapRouter": "0x...",
  "scenarioDeployer": "0x...",
  "deploymentMode": "phased",
  "poolsPerBatch": 12,
  "tokens": { "USDC": "0x...", "GOOD": "0x...", "BAD": "0x...", "BAIT": "0x..." },
  "pools": []
}
```

Pool metadata is read from chain by backend (`DemoPoolRegistry.poolCount()` = **48**, sealed).

### Core demo contracts

| Contract | Role |
|----------|------|
| `MockUSDC` | 6-decimal USDC |
| `DemoToken` / `DemoERC20` | GOOD, BAD, BAIT (18 dec) |
| `DemoPair` | Uniswap V2-style `swap()`, `getReserves()` |
| `DemoPoolRegistry` | Register **48** pools (incl. SDA label), seal, token risk tags |
| `DemoScenarioDeployer` | Phased deploy: `beginScenario` → `deployPoolBatch` → `sealScenario`; seed liquidity, `fundSwapper()` |
| `DemoSwapRouter` | `vault.executeRoute` + `fundSwapper` + `pair.swap` in **one tx** |
| `VaultExecution` | EIP-712 gate (standalone or via Router) |

### Pool labels

| Label | On-chain liquidity | Agent / demo role |
|-------|-------------------|-------------------|
| SAFE | Deep reference | Fair quote baseline |
| SHALLOW | Thin | High price impact; fallback candidate |
| TOXIC | Manipulated quote | ~25% above SAFE; force slippage catches deviation |
| SDA | Same depth as SAFE | Execution-window risk (paper SDA analogue) |

### Price ratio

USDC : GOOD : BAD : BAIT = **1 : 20 : 100 : 1** (reserve math in deployer).

### Route naming (off-chain convention)

```text
route-{tokenIn}-{tokenOut}-{safe|shallow|toxic|sda}
```

12 directed pairs × 4 pools = **48 routes**.

### Verification scripts

```powershell
# Forge unit test (no RPC) — 48/48 direct swaps
forge test --match-contract SwapAll36Routes -vvv
forge test --match-contract DemoPoolsIntegration -vvv
forge test --match-contract DemoSwapRouter -vvv

# On-chain swap script (needs deployed registry)
forge script script/TestAll36Swaps.s.sol:TestAll36Swaps `
  --rpc-url http://127.0.0.1:8545 -vvv

# Post-deploy sanity
forge script script/Verify36SwapsDeployed.s.sol:Verify36SwapsDeployed `
  --rpc-url http://127.0.0.1:8545 -vvv
```

Backend batch (after deploy + backend up):

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8080/api/swap/verify-all `
  -ContentType "application/json" -Body '{"amountIn":1}'
# Expected force mode: passed=36, failed=12 (TOXIC slippage)
```

### fundSwapper (demo only)

```solidity
function fundSwapper(address token, address recipient, uint256 amount) external;
```

Transfers from deployer inventory to swap wallet. **Access controlled:** only addresses in `authorizedFunders` (DemoSwapRouter + deployer EOA).

Backend `swapService` uses Router (1 tx) or direct path: `fundSwapper` → `transfer` → `pair.swap()`.

### DemoSwapRouter

```solidity
function swapWithPermit(
    address user,
    bytes32 routeId,
    uint256 amountIn,
    uint256 amountOutQuoted,
    uint256 amountOutMin,
    uint256 deadline,
    uint256 riskScore,
    uint8 decision,
    uint256 nonce,
    bytes calldata signature,
    address recipient
) external returns (uint256 amountOut);
```

Combines Vault gate + funding + DEX swap. Backend signs EIP-712 permit via `agentSignService.ts`. Safe mode passes `amountOutMin=0`; force mode passes slippage-derived min/max.

---

## VaultExecution (Execution Gate)

Chain-side gate. Validates Agent EIP-712 permit; does **not** call DEX directly (Router wraps it for demo).

See [`docs/architecture.md`](../docs/architecture.md) and [`docs/api-contract.md`](../docs/api-contract.md) for EIP-712 details.

---

## Build & Test

```powershell
cd contracts
forge build
forge test
```

Notable tests:

- `SwapAll36Routes.t.sol` — **48/48** swaps in forge (`test_all48RoutesSwapSuccessfully`)
- `DemoPoolsIntegration.t.sol` — 48 pool count, SDA ≈ SAFE quote, ordering
- `DemoSwapRouter.t.sol` — Router + Vault + swap
- `VaultExecution*.t.sol` — gate, rejection, boundary
- `DemoScenarioDeployer.t.sol` — phased deploy, Monad gas cap per batch
- `DemoPoolRegistry.t.sol` — seal count, reference pool

CI: `.github/workflows/ci.yml` — `forge test` + backend build + **`demo-local`** job（Anvil 31337 + verify-all 36/12）。

---

## Backend integration

After deploy, run `scripts/sync-backend-env.ps1` or `.\start-demo.ps1` — **do not hand-copy addresses**.

See root [`README.md`](../README.md) and [`docs/api-contract.md`](../docs/api-contract.md).
