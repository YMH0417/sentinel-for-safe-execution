# Documentation Index

> **Last updated**: 2026-08-02

## Start here

| Doc | Audience | Content |
|-----|----------|---------|
| [`../README.md`](../README.md) | Everyone | Quick start, one-click deploy, Safe/Unsafe, API overview |
| [`architecture.md`](architecture.md) | Developers | Safe vs force flow, Router, modules, chain modes |
| [`api-contract.md`](api-contract.md) | Frontend / integrators | HTTP schemas **v0.5** |
| [`analysis-pipeline.md`](analysis-pipeline.md) | Data / backend | Reusable ingestion, validation, metrics, CLI, and API |
| [`data-analysis.md`](data-analysis.md) | Product / judges | Baseline findings and evidence limits |
| [`sentinel-data-analysis.xlsx`](sentinel-data-analysis.xlsx) | Product / data | Formula-driven route observations and charts |

## Scenarios & demos

| Doc | Content |
|-----|---------|
| [`route-scenarios.md`](route-scenarios.md) | Mock routes (Part I) + **48** demo routes incl. SDA (Part II) |
| [`demo-script.md`](demo-script.md) | Presentation scripts (Safe/Unsafe, Agent, slippage demo) |

## Windows 一键启动

```powershell
.\start-demo.ps1 -VerifySwaps              # 默认 anvil-local @31337
.\start-demo.ps1 -Profile anvil-fork-monad   # fork Monad @10143
.\scripts\switch-demo-profile.ps1 -Profile monad-testnet
.\scripts\deploy-monad-testnet.ps1
```

| 脚本 | 说明 |
|------|------|
| [`../start-demo.ps1`](../start-demo.ps1) | 根目录快捷入口 |
| [`../switch-demo.ps1`](../switch-demo.ps1) | 切换 DEMO_PROFILE |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | 主启动脚本（`-Profile`） |
| [`../scripts/switch-demo-profile.ps1`](../scripts/switch-demo-profile.ps1) | manifest → `backend/.env`（不 redeploy） |
| [`../scripts/sync-backend-env.ps1`](../scripts/sync-backend-env.ps1) | manifest → `backend/.env` |

Profile 定义：[`../shared/demo-chain-profiles.json`](../shared/demo-chain-profiles.json)  
Manifest：`local-31337-demo.json`（local）/ `monad-10143-demo.json`（remote）

## Contracts

| Doc | Content |
|-----|---------|
| [`../contracts/README.md`](../contracts/README.md) | Deploy, DemoSwapRouter, 48-route tests |

## Change logs (historical + latest)

| Doc | Date | Topic |
|-----|------|-------|
| [`dev-changes/dev-phase2-safe-swap.md`](dev-changes/dev-phase2-safe-swap.md) | 2026-07-28 / **07-31** | Safe swap, Router, 48 池 + SDA, frontend Safe/Unsafe |
| [`dev-changes/dev-a-changes-demo-chain.md`](dev-changes/dev-a-changes-demo-chain.md) | 2026-07-28 | 36 池合约（历史） |
| [`dev-changes/dev-c-changes-demo-chain.md`](dev-changes/dev-c-changes-demo-chain.md) | 2026-07-28 | Demo 36 路由场景（历史） |
| [`dev-changes/dev-d-changes-demo-chain.md`](dev-changes/dev-d-changes-demo-chain.md) | 2026-07-28 | Swap API + demo chain |
| [`dev-changes/dev-a-changes-thu.md`](dev-changes/dev-a-changes-thu.md) | 2026-07-23 | VaultExecution 初版 |
| [`dev-changes/dev-c-changes-thu.md`](dev-changes/dev-c-changes-thu.md) | 2026-07-23 | Mock route 设计 |
| [`dev-changes/dev-c-changes-fri.md`](dev-changes/dev-c-changes-fri.md) | 2026-07-24 | Mock 联调 |
| [`dev-changes/dev-d-changes-thu.md`](dev-changes/dev-d-changes-thu.md) | 2026-07-23 | Backend 初版 |
| [`dev-changes/dev-d-changes-sat.md`](dev-changes/dev-d-changes-sat.md) | 2026-07-25 | Events / config |
| [`dev-changes/dev-d-changes-sun.md`](dev-changes/dev-d-changes-sun.md) | 2026-07-26 | CHAIN_MODE=mock |

## Reference

- 论文：[2501.17335v2](2501.17335v2.pdf) — SIA/SDA 跨链套利；demo 中 SDA 池映射执行窗口风险
- EIP-712 schema：`../contracts/integration/execution-permit.json`

## Doc maintenance

接口或行为变更顺序：**改代码 → 更新 `api-contract.md` + `README.md` → 必要时更新 `route-scenarios.md` / `architecture.md` → 追加 `dev-changes/` 记录**。
