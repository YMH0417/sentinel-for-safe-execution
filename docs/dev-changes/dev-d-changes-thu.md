# Dev D 变更记录 — 2026-07-23（周四）

## 改了哪些文件

| 文件 | 改了什么 |
|------|---------|
| `backend/src/routes/execute.ts` | 执行前强制重新调用 `evaluateRoute()`，不再信任外部传入的 decision；非 ALLOW 一律在闸门拦截、不上链；成功/拒绝都会调用 `addEvent()` 落库 |
| `backend/src/routes/evaluate.ts` | 评估完成后调用 `addEvent()`，记录 `DecisionMade` 事件 |
| `docs/api-contract.md` | 同步更新 "Execute Route" 一节：request 新增可选 `configProfile`；response 新增 `decision` 字段；补充 REJECT/FALLBACK 场景的 response 示例 |

## 修复的问题

1. **`/execute` 之前没有真正走安全判定**：原代码硬编码 `riskScore: 0, decision: "ALLOW"` 传给 vaultService，导致即便某条 route 的风险分很高，只要滑点没超限就会被放行，安全闸门形同虚设。
2. **`/events` 之前永远返回空数组**：`evaluate.ts` / `execute.ts` 都没有调用 `addEvent()`，事件日志从未被写入。

## execute 响应新增字段说明

- ALLOW：正常执行，`success: true`，`event.eventType` 为 `ExecutionSuccess`。
- REJECT：闸门拦截，不上链，`success: false`，`event.eventType` 为 `ExecutionRejected`。
- FALLBACK_TO_SAFE_ROUTE：闸门拦截，不上链，`success: false`，`event.eventType` 为 `FallbackRequired`，`decision.fallbackRouteId` 指向建议改用的路由；前端需要自行再调用一次 `/execute`（传入 fallbackRouteId）才会真正执行。

## 影响

- `/execute` 的响应体新增了一个 `decision` 字段（向后兼容，不影响老字段）。
- `/events` 现在会返回真实数据，但仍是内存存储：**服务重启后事件会清空**，这是本周计划内合理限制（不接数据库），不是新引入的问题。

## 未改动

- 前端 `App.tsx` 里手拼 Timeline 假数据的那段（第 78-107 行）**没有动**，等这次改动合并进主仓库、确认 `/events` 有真实数据后，再改前端接真实接口。

## 验证方式

```bash
curl -X POST http://127.0.0.1:8080/api/evaluate -H "Content-Type: application/json" -d '{"routeId":"route-a"}'
curl -X POST http://127.0.0.1:8080/api/execute -H "Content-Type: application/json" -d '{"routeId":"route-a","maxLossBps":100}'
curl http://127.0.0.1:8080/api/events
# events 数组应包含 DecisionMade + ExecutionSuccess 两条记录
```
