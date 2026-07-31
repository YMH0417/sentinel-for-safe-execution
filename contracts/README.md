# Contracts — Sentinel Demo + VaultExecution

> **Last updated**: 2026-07-31

Solidity **0.8.24**, Foundry. Two deployment tracks:

1. **VaultExecution** — EIP-712 execution gate (production path)
2. **Demo scenario** — **48 pools** (12 pairs × SAFE/SHALLOW/TOXIC/SDA), 4 tokens, real swaps on Anvil (+ DemoSwapRouter)

---

## Quick start (Windows, recommended)

```powershell
# From repo root — Anvil + deploy + backend/.env + services
.\start-demo.ps1
```

Or deploy only:

```powershell
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000

cd contracts
forge script script/DeployAllDemo.s.sol:DeployAllDemo `
  --rpc-url http://127.0.0.1:8545 --broadcast -vvv

powershell -ExecutionPolicy Bypass -File ../scripts/sync-backend-env.ps1
```

> Anvil restart invalidates state — re-run `.\start-demo.ps1` to redeploy and rewrite `.env`.

---

## Demo 48-Route Scenario (Anvil)

### Prerequisites

```powershell
# MUST raise block gas limit (deploy ~72M gas for 48 pools)
anvil --chain-id 31337 --port 8545 --block-gas-limit 120000000
```

### Deploy output

Forge auto-writes **`deployments/anvil-31337-demo.json`**:

```json
{
  "chainId": 31337,
  "registry": "0x...",
  "vaultExecution": "0x...",
  "swapRouter": "0x...",
  "scenarioDeployer": "0x...",
  "agentSigner": "0x...",
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
| `DemoScenarioDeployer` | Deploy all, seed liquidity, `fundSwapper()` |
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
- `DemoPoolRegistry.t.sol` — seal count, reference pool

CI: `.github/workflows/ci.yml` runs `forge test` + backend build.

---

## Backend integration

After deploy, run `scripts/sync-backend-env.ps1` or `.\start-demo.ps1` — **do not hand-copy addresses**.

See root [`README.md`](../README.md) and [`docs/api-contract.md`](../docs/api-contract.md).
