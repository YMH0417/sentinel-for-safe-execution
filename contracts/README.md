# Contracts — Sentinel Demo + VaultExecution

> **Last updated**: 2026-07-28

Solidity **0.8.24**, Foundry. Two deployment tracks:

1. **VaultExecution** — EIP-712 execution gate (production path)
2. **Demo scenario** — 36 pools, 4 tokens, real swaps on Anvil (+ DemoSwapRouter)

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

## Demo 36-Route Scenario (Anvil)

### Prerequisites

```powershell
# MUST raise block gas limit (deploy ~48M gas)
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

Pool metadata is read from chain by backend (`DemoPoolRegistry.poolCount()` = 36, sealed).

### Core demo contracts

| Contract | Role |
|----------|------|
| `MockUSDC` | 6-decimal USDC |
| `DemoToken` / `DemoERC20` | GOOD, BAD, BAIT (18 dec) |
| `DemoPair` | Uniswap V2-style `swap()`, `getReserves()` |
| `DemoPoolRegistry` | Register 36 pools, seal, token risk tags, `getPoolByRouteId` |
| `DemoScenarioDeployer` | Deploy all, seed liquidity, `fundSwapper()` |
| `DemoSwapRouter` | `vault.executeRoute` + `fundSwapper` + `pair.swap` in **one tx** |
| `VaultExecution` | EIP-712 gate (standalone or via Router) |

### Price ratio

USDC : GOOD : BAD : BAIT = **1 : 20 : 100 : 1** (reserve math in deployer).

### Route naming (off-chain convention)

```text
route-{tokenIn}-{tokenOut}-{safe|shallow|toxic}
```

12 directed pairs × 3 pools = **36 routes**.

### Verification scripts

```powershell
# Forge unit test (no RPC)
forge test --match-contract SwapAll36Routes -vvv
forge test --match-contract DemoSwapRouter -vvv

# On-chain swap script (needs deployed registry)
forge script script/TestAll36Swaps.s.sol:TestAll36Swaps `
  --rpc-url http://127.0.0.1:8545 -vvv

# Quote tables
forge script script/GenerateQuoteTables.s.sol:GenerateQuoteTables `
  --rpc-url http://127.0.0.1:8545 -vvv

# Post-deploy sanity
forge script script/Verify36SwapsDeployed.s.sol:Verify36SwapsDeployed `
  --rpc-url http://127.0.0.1:8545 -vvv
```

Legacy 9-pool quote verify:

```powershell
$env:DEMO_REGISTRY_ADDRESS = "0x..."
$env:DEMO_USDC_ADDRESS = "0x..."
forge script script/VerifyDemoQuotes.s.sol:VerifyDemoQuotes `
  --rpc-url http://127.0.0.1:8545 -vvv
```

### fundSwapper (demo only)

```solidity
function fundSwapper(address token, address recipient, uint256 amount) external;
```

Transfers from deployer inventory to swap wallet. **Access controlled:** only addresses in `authorizedFunders` (DemoSwapRouter + deployer EOA). `DeployAllDemo` calls `authorizeFunder(router)` and `authorizeFunder(deployer)`.

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

Combines Vault gate + funding + DEX swap. Backend signs EIP-712 permit via `agentSignService.ts`.

---

## VaultExecution (Execution Gate)

Chain-side gate. Validates Agent EIP-712 permit; does **not** call DEX directly (Router wraps it for demo).

### Deliverables

| File | Purpose |
|------|---------|
| `abi/VaultExecution.json` | Standard ABI |
| `integration/execution-permit.json` | EIP-712 schema |
| `script/DeployVaultExecution.s.sol` | Standalone Vault deploy |

### Security constraints

- `paused` — owner only
- `maxLossBps` — owner, 0–10000
- `deadline` — expired permit reverts
- `agentSignature` — must match `agentSigner` EIP-712 digest
- `nonce` — per-user monotonic
- `riskScore >= 70` or `decision == REJECT` → `VaultRejected`, no execution

### executeRoute

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

| decision | Value |
|----------|------:|
| ALLOW | 0 |
| REJECT | 1 |
| FALLBACK_TO_SAFE_ROUTE | 2 |

### EIP-712 Domain

```text
name: Sentinel Vault Execution
version: 1
chainId: <current>
verifyingContract: <VaultExecution address>
```

Primary type: `ExecutionPermit(user, routeId, amountIn, amountOutQuoted, deadline, riskScore, decision, nonce)`.

---

## Build & Test

```powershell
cd contracts
forge build
forge test
```

Notable tests:

- `SwapAll36Routes.t.sol` — 36/36 swaps in forge
- `DemoSwapRouter.t.sol` — Router + Vault + swap
- `VaultExecution*.t.sol` — gate, rejection, boundary
- `DemoPoolRegistry.t.sol` — seal count, reference pool

CI: `.github/workflows/ci.yml` runs `forge test` + backend build.

---

## Deploy Vault (standalone)

Copy `.env.example`:

```env
PRIVATE_KEY=
AGENT_SIGNER=
VAULT_ADMIN=
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
```

```powershell
forge script script/DeployVaultExecution.s.sol:DeployVaultExecution `
  --rpc-url http://127.0.0.1:8545 --broadcast
```

Monad Testnet (chain ID 10143): use `$MONAD_RPC_URL`.

**Never commit `.env` or private keys.**

---

## Backend integration

After deploy, run `scripts/sync-backend-env.ps1` or `.\start-demo.ps1` — **do not hand-copy addresses**.

Generated `backend/.env`:

```env
CHAIN_MODE=demo
RPC_URL=http://127.0.0.1:8545
DEMO_REGISTRY_ADDRESS=<from JSON>
VAULT_EXECUTION_ADDRESS=<from JSON>
DEMO_SWAP_ROUTER_ADDRESS=<from JSON>
DEMO_SCENARIO_DEPLOYER=<from JSON>
SWAP_PRIVATE_KEY=<Anvil #0>
AGENT_PRIVATE_KEY=<Anvil #0, must match agentSigner>
```

Backend also reads vault/router from `DEMO_DEPLOYMENT_PATH` if env vars omitted.

See root [`README.md`](../README.md) and [`docs/api-contract.md`](../docs/api-contract.md).
