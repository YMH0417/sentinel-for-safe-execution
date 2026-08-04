# 链条状态 · 链上成交量索引（内部）

> **Last updated**: 2026-08-05

## 架构

```
Monad RPC  ←── 每 60s ── poolVolumeCacheService
                      └── poolVolumeService (getLogs + SAFE 计价)
                                ↓
                    GET /api/debug/pool-volume
                                ↓
                         Dashboard 链条状态框
```

前端 **不** 直接访问 RPC；用户点击 ↻ 仅 `GET` backend 缓存（`?refresh=true` 不会由 Dashboard 触发）。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `POOL_VOLUME_CACHE_TTL_MS` | 60000 | API 缓存 TTL |
| `POOL_VOLUME_POLL_MS` | 60000 | 后台轮询间隔 |
| `POOL_VOLUME_LOG_PACE_MS` | 200 | 每次 `getLogs` / 储备读取之间的间隔（ms），避免 RPC 限流 |

## Monad RPC 限制

Monad 公共 RPC 对 `eth_getLogs` 有 **单次最多 100 个区块** 的限制（错误：`eth_getLogs is limited to a 100 range`）。索引器使用 `BLOCK_CHUNK = 99`，并合并 `RouterSwapExecuted` + `SdaExecutionWindowCompleted` 为一次 topic 查询，减少请求次数。

若索引失败，API 仍返回 **200** 与四行零值占位（`byLabel`），前端始终展示 SAFE/SHALLOW/TOXIC/SDA 四行；`cache.error` 字段记录后台错误。

## 索引规则

1. 扫描 **全局** 最近 **100** 笔链上成交：`RouterSwapExecuted`、`SdaExecutionWindowCompleted` + 各 DemoPair 的 `Swap`（含 Force 直连）
2. 按 block/logIndex **降序** 合并后取前 **100** 条，再按池标签 SAFE/SHALLOW/TOXIC/SDA **汇总** USDC 成交量与笔数
3. USDC 名义量：与旧规则相同（SAFE 池 spot 折算）
4. 与「交易情况概览」窗口一致：均为全链近 100 笔，非每池各 100 笔

## 相关文件

- `backend/src/services/poolVolumeService.ts`
- `backend/src/services/poolVolumeCacheService.ts`
- `backend/src/routes/debug.ts` — `GET /api/debug/pool-volume`
- `backend/src/index.ts` — `startPoolVolumePolling()`
