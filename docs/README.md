# Documentation Index

> **Last updated**: 2026-08-02

## Start here

| Doc | Audience | Content |
|-----|----------|---------|
| [`../README.md`](../README.md) | Everyone | Quick start, profiles, Safe/Unsafe, API overview |
| [`architecture.md`](architecture.md) | Developers | Flows, Router vs MetaMask, modules, chain modes |
| [`api-contract.md`](api-contract.md) | Frontend / integrators | HTTP schemas **v0.6** |
| [`demo-script.md`](demo-script.md) | Presenters | Safe/Unsafe demo script, profile switching |
| [`route-scenarios.md`](route-scenarios.md) | QA / product | Mock routes + 48 demo routes (incl. SDA) |
| [`analysis-pipeline.md`](analysis-pipeline.md) | Data / backend | Event analysis engine |
| [`data-analysis.md`](data-analysis.md) | Product | Baseline findings and evidence limits |
| [`CHANGELOG.md`](CHANGELOG.md) | Everyone | Release notes (replaces `dev-changes/`) |

## Demo profiles

| Profile | Chain ID | RPC | Manifest |
|---------|----------|-----|----------|
| `anvil-local` | 31337 | `http://127.0.0.1:8545` | `local-31337-demo.json` |
| `anvil-fork-monad` | 10143 | Anvil fork of Monad testnet | `local-10143-demo.json` |
| `monad-testnet` | 10143 | `https://testnet-rpc.monad.xyz` | `monad-10143-demo.json` |

```powershell
.\start-demo.ps1 -Profile anvil-local -VerifySwaps
.\start-demo.ps1 -Profile anvil-fork-monad -VerifySwaps
.\scripts\deploy-monad-testnet.ps1
.\scripts\switch-demo-profile.ps1 -Profile monad-testnet   # or use Settings UI
```

Definition: [`../shared/demo-chain-profiles.json`](../shared/demo-chain-profiles.json)

## Scripts

| Script | Purpose |
|--------|---------|
| [`../start-demo.ps1`](../start-demo.ps1) | Root shortcut → `scripts/start-demo.ps1` |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | Anvil + deploy + backend + frontend |
| [`../scripts/switch-demo-profile.ps1`](../scripts/switch-demo-profile.ps1) | Rewrite `backend/.env` without redeploy |
| [`../scripts/sync-backend-env.ps1`](../scripts/sync-backend-env.ps1) | Manifest → `.env` |
| [`../scripts/ci-demo-local.sh`](../scripts/ci-demo-local.sh) | CI: local 31337 + verify-all |

## Contracts

[`../contracts/README.md`](../contracts/README.md) — DeployAllDemo, DemoSwapRouter, forge tests.

## Reference

- Paper: [2501.17335v2](2501.17335v2.pdf) — SDA execution-window risk in demo maps to §3.2.2
- EIP-712: [`../contracts/integration/execution-permit.json`](../contracts/integration/execution-permit.json)

## Maintenance

When behavior changes: **code → `api-contract.md` + `README.md` → `demo-script.md` / `architecture.md` if needed → append `CHANGELOG.md`**.
