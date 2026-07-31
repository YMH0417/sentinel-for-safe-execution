# Documentation Index

> **Last updated**: 2026-07-31

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
.\start-demo.ps1                 # 全量：Anvil + deploy + .env + backend + frontend
.\start-demo.ps1 -SkipDeploy     # 保留链状态，只同步 .env 并重启服务
.\start-demo.ps1 -SkipFrontend   # 只启 backend
.\start-demo.ps1 -VerifySwaps    # 启动后自动跑 48 条 force verify-all
.\start-demo.ps1 -SkipInstall    # 跳过 npm install（二次启动更快）
```

| 脚本 | 说明 |
|------|------|
| [`../start-demo.ps1`](../start-demo.ps1) | 根目录快捷入口 |
| [`../scripts/start-demo.ps1`](../scripts/start-demo.ps1) | 主启动脚本 |
| [`../scripts/sync-backend-env.ps1`](../scripts/sync-backend-env.ps1) | manifest → `backend/.env` |

部署 manifest：`contracts/deployments/anvil-31337-demo.json`（forge 自动写入）  
Backend 配置：`backend/.env`（由 sync 脚本生成，dotenv 自动加载）

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
