# Monad Testnet (10143) — On-Chain Contract Inventory

> **Last verified**: 2026-08-05 (UTC+8)  
> **RPC**: `https://testnet-rpc.monad.xyz`  
> **Manifest**: [`contracts/deployments/monad-10143-demo.json`](../contracts/deployments/monad-10143-demo.json)  
> **Profile**: `monad-testnet` (`deploymentTarget: remote`)

This document is the canonical inventory for **public Monad testnet** deployments. Pool pair addresses are **not** stored in the manifest; they live in `DemoPoolRegistry` on chain.

Re-run verification:

```powershell
.\scripts\verify-monad-testnet.ps1
```

---

## Verification summary (2026-08-05)

| Check | Expected | On-chain result | Status |
|-------|----------|-----------------|--------|
| Chain ID | 10143 | 10143 | OK |
| Registry `poolCount()` | 48 | 48 | OK |
| Registry `isSealed()` | true | true | OK |
| Registry `tokenCount()` | 4 | 4 | OK |
| ScenarioDeployer `poolsDeployed()` | 48 | 48 | OK |
| ScenarioDeployer `scenarioSealed()` | true | true | OK |
| ScenarioDeployer `POOL_COUNT()` | 48 | 48 | OK |
| Registry deployer | ScenarioDeployer | `0x0C00…c2D4` | OK |
| ScenarioDeployer `registry()` | Registry | `0x1757…bD07` | OK |
| Router → Vault / Registry / Deployer / Achievements | manifest addresses | all match | OK |
| Vault `achievements()` | Achievements | `0xA73a…62be` | OK |
| Achievements `reporters(vault)` | true | true | OK |
| Achievements `reporters(router)` | true | true | OK |
| Achievements `usdcToken()` | USDC | `0xD52b…72aF` | OK |
| Router authorized on ScenarioDeployer | true | true | OK |
| Sample route `route-usdc-good-safe` | resolves to pair | pair `0x6A5E…d8E7`, label SAFE (0) | OK |
| Sample pair `getReserves()` | non-zero | reserves present | OK |
| All 4 tokens: symbol / decimals / bytecode | USDC 6d; others 18d | match | OK |
| Active infra contracts: bytecode | non-empty | 2.3–23 KB each | OK |
| Orphan Vault/Router (pre-badge) | bytecode still on chain | 3.0 / 4.2 KB | noted |

---

## Contract count

| Layer | Count | Notes |
|-------|------:|-------|
| Demo tokens | 4 | USDC, GOOD, BAD, BAIT |
| DemoPair pools | 48 | 12 directed pairs × 4 labels (SAFE / SHALLOW / TOXIC / SDA) |
| DemoPoolRegistry | 1 | indexes all pools; `poolCount = 48` |
| DemoScenarioDeployer | 1 | phased deployer + `fundSwapper` |
| VaultExecution | 1 | EIP-712 execution gate (**current**) |
| DemoSwapRouter | 1 | vault + fund + swap in one tx (**current**) |
| SentinelAchievements | 1 | on-chain badge / stats ledger |
| **Total (active demo stack)** | **56** | what backend + frontend use today |

EOA (not contracts): deployer / agentSigner / testUser = `0x881915BE66Be800Cc180b6244809A1D188Bc1b2c`.

---

## Active addresses (manifest)

### Infrastructure

| Role | Contract | Address |
|------|----------|---------|
| Pool registry | `DemoPoolRegistry` | `0x1757dD1615885a44a2fB3aa5A39C504aB3BFbD07` |
| Scenario deployer | `DemoScenarioDeployer` | `0x0C00008d3Df7EC6A365770437741Fa991C87c2D4` |
| Execution gate | `VaultExecution` | `0x18B8E9d0391D3aAD05b5F408811D510B38f50FFd` |
| Swap router | `DemoSwapRouter` | `0xFA18c940A5D7EFB861d28C71b215c867F237b51B` |
| Achievements | `SentinelAchievements` | `0xA73afF431841f1436E026A53887A565Bb0Dd62be` |

### Tokens

| Symbol | Contract | Address | Decimals |
|--------|----------|---------|----------|
| USDC | `MockUSDC` | `0xD52b74c0a6aB06D51e09a7eC19F5B379b9ea72aF` | 6 |
| GOOD | `DemoToken` | `0x230e61ec5e90DeA10495afD4F0E8E1bCDeaD0951` | 18 |
| BAD | `DemoToken` | `0x898675E5B15E374a573e6B6D3d56f85FA85c82B5` | 18 |
| BAIT | `DemoToken` | `0xA26C06AaBdE448EF5598FE0d5B5a867057404585` | 18 |

### 48 pools (`DemoPair`)

Not listed in JSON. Query on chain:

```powershell
# Example: first SAFE route USDC → GOOD
cast call 0x1757dD1615885a44a2fB3aa5A39C504aB3BFbD07 `
  "getPoolByRouteId(bytes32)(bytes32,address,address,address,uint8)" `
  $(cast keccak "route-usdc-good-safe") `
  --rpc-url https://testnet-rpc.monad.xyz
# → pair 0x6A5E47753a9Cf043DcCa42c53934889B39ECd8E7 (verified 2026-08-05)
```

Route naming: `route-{tokenIn}-{tokenOut}-{safe|shallow|toxic|sda}` (lowercase keys). See [`route-scenarios.md`](route-scenarios.md).

---

## Wiring (verified)

```text
DemoScenarioDeployer
  ├── deploys & owns → 4 tokens + 48 DemoPair + DemoPoolRegistry
  └── authorizedFunders[DemoSwapRouter] = true

DemoSwapRouter
  ├── vault        → VaultExecution (current)
  ├── registry     → DemoPoolRegistry
  ├── scenarioDeployer → DemoScenarioDeployer
  └── achievements → SentinelAchievements

VaultExecution
  ├── agentSigner / owner → 0x881915BE…
  └── achievements → SentinelAchievements

SentinelAchievements
  ├── usdcToken → USDC
  └── reporters[vault] = reporters[router] = true
```

Backend reads addresses from manifest via `DEMO_PROFILE=monad-testnet`. Do not hand-copy; use `scripts/sync-backend-env.ps1` or Settings profile switch.

---

## Orphan contracts (historical, not used by app)

Badge system patch ([`DeployBadgeSystem.s.sol`](../contracts/script/DeployBadgeSystem.s.sol), commit `75098ac`) redeployed Vault + Router + Achievements **without** redeploying tokens, registry, or pools. Previous instances remain on chain:

| Contract | Superseded address | Replaced by |
|----------|-------------------|-------------|
| `VaultExecution` | `0xce9F5bdCAfC36E5468F738845203Ce3064eB50f9` | `0x18B8…0FFd` |
| `DemoSwapRouter` | `0x69ED45779c05DE88CEE06d668Aa6b356C3f9Aad9` | `0xFA18…51B` |

Both still have contract bytecode on chain (verified 2026-08-05). Safe to ignore for demo operations; only manifest addresses are wired in backend/frontend.

---

## What this project does **not** deploy on Monad

| Item | Note |
|------|------|
| WETH / official DEX | May exist on testnet from others; not part of Sentinel demo |
| `UniswapV2Quote` library | Inlined; no standalone address |
| Standalone `DeployVaultExecution.s.sol` | Local Anvil helper only |
| Third profile manifests | `local-31337-demo.json` / `local-10143-demo.json` are **different deployments** |

---

## Profile confusion guard

| Profile | Chain ID | Same as public testnet? | Contract set |
|---------|----------|-------------------------|--------------|
| `anvil-local` | 31337 | No | Fresh local Anvil |
| `anvil-fork-monad` | 10143 | Same ID, **different addresses** | Local redeploy on fork |
| **`monad-testnet`** | **10143** | **Yes (this doc)** | **Remote manifest above** |

Switching MetaMask to 10143 is not enough — confirm `DEMO_PROFILE` / Settings profile matches `monad-testnet`.

---

## Bytecode sizes (2026-08-05 snapshot)

| Address / role | Code size (bytes) |
|----------------|------------------:|
| Registry | 4212 |
| ScenarioDeployer | 23030 |
| VaultExecution (current) | 3372 |
| DemoSwapRouter (current) | 4416 |
| SentinelAchievements | 2369 |
| Each demo token | 2231 |
| Sample DemoPair | 3034 |
| VaultExecution (orphan) | 2955 |
| DemoSwapRouter (orphan) | 4185 |

---

## Related docs

- Deploy procedure: [`../contracts/README.md`](../contracts/README.md)
- Demo script: [`demo-script.md`](demo-script.md)
- Route matrix: [`route-scenarios.md`](route-scenarios.md)
- Architecture: [`architecture.md`](architecture.md)
