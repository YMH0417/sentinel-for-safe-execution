# Dev C 今日变更记录 — 2026-07-23（周四）

> 这份文档是给其他 Dev 看的——Dev C 改了哪些数据，其他人需要关注什么。

---

## 改了哪些文件

| 文件 | 改了什么 | 其他人需要关注？ |
|------|---------|:---:|
| `shared/demo-data/routes.json` | 3 条 route 数值全部增强，加了 `notes` 和 `expectedDecision` 字段 | ✅ 是（核心交付物） |
| `shared/types/route.ts` | `createMockRoutes()` 同步新数值 | ✅ 是 |
| `shared/types/decision.ts` | `createMockDecision()` riskScore/flags/reason 同步 | ✅ 是 |
| `docs/route-scenarios.md` | 新增 164 行场景文档 | ❌ 参考用 |
| `docs/api-contract.md` | evaluate 响应示例更新 | ✅ 是 |
| `README.md` | riskScore 注释更新 | ✅ 是 |

---

## ⚠️ 值得注意的信息

### 1. Route 数值变了，但字段名没变

所有旧字段（`quotedOut`、`expectedOut`、`poolRiskScore`、`historicalFailureRate`、`supportsFallback`、`fallbackRouteId`）都保留，**类型和结构完全向后兼容**。后端 `routeService.ts` 的 `getRoutes()` 和 `getRouteById()` 不需要任何改动。

### 2. 新增了两个可选字段

在 `routes.json` 中，每条 route 新增了：

| 字段 | 类型 | 说明 |
|------|------|------|
| `expectedDecision` | `string?` | 标注这条 route 预期触发什么决策（ALLOW / REJECT / FALLBACK） |
| `notes` | `string?` | 标注这条 route 对应论文哪个章节、什么攻击场景 |

这两个字段**不在 `Route` TypeScript interface 里**，所以：
- TypeScript 不会报错（额外字段被忽略）
- 后端 Agent 不会读取它们
- 前端也不会显示它们
- 它们只是**给人看的标注**

如果你（其他 Dev）明天要自己加 route 数据，请保持一致的字段名。

### 3. 三条 route 的决策阈值验证结果

| Route | Risk Score | Decision | 触发规则 |
|-------|-----------|----------|---------|
| route-a | **0** | ALLOW | 无任何规则触发 |
| route-b | **95** | REJECT | Rule A + Rule B + Rule C 全部触发 |
| route-c | **60** | FALLBACK | Rule A + Rule B + Rule C 全部触发 |

验证方式：
```bash
curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-a"}'
# → riskScore: 0, decision: ALLOW

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-b"}'
# → riskScore: 95, decision: REJECT

curl -X POST http://127.0.0.1:8080/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"routeId":"route-c"}'
# → riskScore: 60, decision: FALLBACK_TO_SAFE_ROUTE
```

### 4. 对各 Dev 的影响

| Dev | 需要改代码？ | 需要注意什么？ |
|-----|:-----------:|---------------|
| Dev A（合约） | ❌ | 无影响 |
| Dev B（Risk Config） | ❌ | 无影响，阈值没变 |
| Dev D（后端） | ❌ | `eventService.ts` 读 `amountIn`/`quotedOut` 的方式不变 |
| Dev E（Agent） | ❌ | `calculateRiskScore()` 用的字段名不变，评分公式不变 |
| 前端 | ❌ | RouteList / SafetyPanel / ResultPanel 读字段不变 |

**总结：你的改动纯数据增强，不影响任何其他人的代码。**

### 5. 数据已冻结

`routes.json` 已锁定为 v1，今天不再临时加新 route。明天如果有人要加新场景，请直接在这 3 条的基础上扩展，不要改它们的数值。

---

## 详细场景说明

每条 route 的设计依据、对应论文章节、评分计算过程，详见：
- [docs/route-scenarios.md](./route-scenarios.md)
