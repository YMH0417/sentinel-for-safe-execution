# Dev C 变更记录 — Demo Chain Routes（2026-07-28）

> 追加于 [`dev-c-changes-fri.md`](dev-c-changes-fri.md)（legacy mock 联调）。

## 场景升级

| 维度 | Legacy (mock) | Demo chain |
|------|---------------|------------|
| 路由数 | 3 (`route-a/b/c`) | **36** |
| 代币 | USDT/USDC 抽象 | USDC, GOOD, BAD, BAIT |
| 报价 | JSON 静态 | 链上储备 + V2 math |
| 池类型 | 隐含在 metadata | SAFE / SHALLOW / TOXIC |
| 价格比 | N/A | 1 : 20 : 100 : 1 |

## 路由命名规范

```text
route-{tokenIn}-{tokenOut}-{pool}
```

实现：`backend/src/config/demoRoutes.ts`

## Agent 场景矩阵（demo mode）

| 场景 | 示例 routeId | 预期 |
|------|--------------|------|
| 健康 SAFE 换币 | `route-usdc-good-safe` | ALLOW |
| 浅池 + fallback | `route-usdc-good-shallow` | FALLBACK 或 REJECT（视 profile） |
| 毒池 | `route-usdc-good-toxic` | REJECT / FALLBACK |
| BAD 作 tokenOut | `route-usdc-bad-safe` | **REJECT** (硬规则) |
| BAIT 作 tokenOut | `route-good-bait-toxic` | **REJECT** (硬规则) |
| BAD 作 tokenIn | `route-bad-usdc-safe` | 走常规三规则 |

## 联调状态（2026-07-28）

| 环节 | 接口 | 状态 |
|------|------|------|
| 链上报价 | GET `/api/quote?tokenIn=USDC&tokenOut=GOOD` | ✅ 3 routes |
| 单路由报价 | GET `/api/quote/route/:id` | ✅ |
| Agent SAFE | POST `/api/evaluate` route-usdc-good-safe | ✅ ALLOW |
| Agent BAD out | POST `/api/evaluate` route-usdc-bad-safe | ✅ REJECT 100 |
| 真实 swap | POST `/api/swap` | ✅ 余额变化 |
| 36 批量 | POST `/api/swap/verify-all` | ✅ 36/36 |
| 池注册表 | GET `/api/demo/pools` | ✅ poolCount=36 |

## 数据文件说明

| 文件 | 用途 |
|------|------|
| `shared/demo-data/routes.json` | **仅 mock 模式**，已冻结 v1.0 |
| `shared/demo-data/demo-routes.json` | 录屏用副本，与 routes.json 一致 |
| 链上 36 路由 | 无 JSON 静态文件，由 registry + backend hydrate |

## 文档

完整场景说明：[`docs/route-scenarios.md`](../route-scenarios.md) Part II
