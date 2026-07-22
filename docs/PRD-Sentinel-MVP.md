# Product Requirement Document (PRD)
## Sentinel for Safe Execution

> **版本：** MVP v0.1  
> **Slogan：** Don't trade naked. 🛡️  
> **编写：** 77

---

## 1. 产品概述

**产品名称：** Sentinel for Safe Execution（简称 Sentinel）

**产品定位：**
Sentinel 是一个面向 DeFi 用户的交易安全助手。在用户执行交易前，系统通过分析交易路径、链上风险指标和执行环境，为用户提供安全评估和执行建议，帮助用户降低交易失败、恶意路径和资金损失风险。

**一句话介绍：**
> 给 DeFi 用户用的「交易安全助手」，帮助用户在交易前判断哪条链、哪条路径更安全，避免踩坑。

**Slogan：**
> Don't trade naked. 🛡️

---

## 2. 用户痛点

当前 DeFi 用户在进行 Swap、跨链等交易时，需要面对：

1. **交易路径风险** — 不同 Route 可能存在流动性不足、滑点过高、失败概率高
2. **信息不透明** — 用户通常只能看到兑换价格和 Gas 费用，但不知道交易路径是否安全、合约是否存在风险、执行失败概率
3. **缺少交易前安全判断** — 传统钱包只负责签名交易，不会告诉用户这笔交易是否值得执行

---

## 3. 产品目标

**MVP 目标：** 建立一个交易前安全评估面板。用户输入交易信息后：
1. 获取多个交易路径
2. 分析路径风险（链安全 / Token 风险 / 合约风险 / 跨链安全）
3. Safety Agent 输出安全建议（ALLOW / REJECT / FALLBACK）
4. 用户决定是否执行
5. 记录安全交易次数，累积 NFT 成就

---

## 4. 用户角色

### DeFi Trader（核心用户）

| 项目 | 说明 |
|------|------|
| 目标 | 快速判断交易风险，避免踩坑 |
| 需求 | 查看不同交易路线、获取风险评分、避免高风险交易 |
| 场景 | 普通 DeFi 用户做 Swap，不确定哪个池子安全 |

---

## 5. 产品核心流程

```
用户进入产品
     │
     ▼
连接钱包（前置条件）
     │
     ▼
输入交易参数（Token In / Token Out / Amount）
     │
     ▼
获取交易路径（GET /quote → 多条 Route）
     │
     ▼
Route 风险分析（链/Token/合约/跨链 4 项指标）
     │
     ▼
Safety Agent 评估（ALLOW / REJECT / FALLBACK）
     │
     ▼
用户选择路径 → 执行交易（POST /execute）
     │
     ▼
展示执行结果 & 事件时间线
     │
     ▼
累计安全交易 → NFT 成就解锁
```

---

## 6. 功能模块设计

### Module 1：钱包连接（全局前置条件）

| 项目 | 说明 |
|------|------|
| 用途 | 用户使用产品的第一步 |
| 交互 | 点击「连接钱包」→ 弹出钱包选择 → 连接后跳转仪表盘 |
| 支持 | MetaMask / WalletConnect / Monad 钱包 |
| 状态 | 未连接时禁用所有交易功能 |

---

### Module 2：交易输入（Transaction Input）

| 项目 | 说明 |
|------|------|
| 用途 | 用户输入交易参数 |
| 布局 | 类似 DEX Swap 页面 |

**页面元素：**

| 字段 | 说明 | 示例 |
|------|------|------|
| Token In | 输入资产 | USDT |
| Token Out | 目标资产 | USDC |
| Amount | 交易数量 | 1000 |
| Chain | 交易链选择 | Monad ▼ |
| Route | 路径预览（自动） | ETH → Bridge → USDC |
| 按钮 | 获取报价 / 开始检测 | 🛡️ 开始安全检测 |

---

### Module 3：路径分析（Route Analysis）

| 项目 | 说明 |
|------|------|
| 用途 | 展示不同交易路径，进行风险比较 |
| 数据来源 | GET /quote → 返回候选 Route 列表 |

**Route Card 包含：**

| 字段 | 说明 | 示例 |
|------|------|------|
| Route Name | 路径名称 | Safe Pool Route |
| Route ID | 路径 ID | route-a |
| Expected Output | 预期输出 | 999 / expected 1000 |
| Risk Score | 风险评分（0-100） | 15 |
| Warning | 风险原因 | high_quote_deviation |
| Decision | Agent 决策 | ALLOW / REJECT / FALLBACK |

**风险等级：**

| 等级 | 分数 | 颜色 | 含义 |
|------|------|------|------|
| Low Risk | 0-30 | 🟢 绿色 | 安全，可执行 |
| Medium Risk | 30-70 | 🟡 黄色 | 需注意，建议降级 |
| High Risk | 70-100 | 🔴 红色 | 高风险，拦截 |

**4 项风险指标卡片：**

| 卡片 | 检测内容 | 状态 |
|------|---------|------|
| ① 链安全分析 | 网络状态、历史攻击、异常活动 | ✅ / ⚠️ / ❌ |
| ② Token 风险检测 | 合约验证、权限、异常交易 | ✅ / ⚠️ / ❌ |
| ③ 智能合约风险 | 漏洞、恶意权限、黑名单 | ✅ / ⚠️ / ❌ |
| ④ 跨链安全评估 | Bridge 安全评分、风险等级 | ✅ / ⚠️ / ❌ |

---

### Module 4：Safety Agent 决策

| 项目 | 说明 |
|------|------|
| 用途 | Agent 根据风险数据给出执行建议 |
| 调用 | POST /evaluate |

**展示内容：**

| 字段 | 说明 | 示例 |
|------|------|------|
| Decision | 决策结果 | ALLOW |
| Risk Score | 综合风险评分 | 0/100 |
| Explanation | 解释说明 | Risk score below threshold. Route is safe to execute. |
| Flags | 风险标签 | ["quote_deviation", "failure_rate"] |

**三种决策：**

| 决策 | 含义 | 后续操作 |
|------|------|----------|
| ✅ ALLOW | 安全，放行 | 用户可执行交易 |
| ❌ REJECT | 高风险，拦截 | 显示原因 + 建议切换路径 |
| ⚠️ FALLBACK | 自动降级到安全路径 | 系统自动切换 |

**Demo 对比模式：**
- 🛡️ **Safe Mode**：走 Agent 评估，展示风险拦截
- ❌ **Unsafe Mode**：跳过 Agent，模拟"没有安全保护的交易"

---

### Module 5：执行结果（Execution Result）

| 项目 | 说明 |
|------|------|
| 用途 | 展示交易执行结果 |
| 调用 | POST /execute |

**展示内容：**

| 字段 | 说明 |
|------|------|
| Transaction Status | 交易状态（成功 / 失败 / 被拦截）|
| Transaction Hash | 交易哈希 |
| Loss | 执行损耗（bps）|
| Agent Decision | Agent 决策回顾 |
| Risk Score | 风险评分 |

**节省对比（Demo 重点）：**
- 有 Agent → 1002 MON ✅
- 无 Agent → 978 MON ❌
- 节省 +2.4% 🎉

---

### Module 6：事件时间线（Event Timeline）

| 项目 | 说明 |
|------|------|
| 用途 | 记录整个交易安全检测流程 |
| 数据来源 | GET /events |

**事件流：**
```
RouteEvaluated → DecisionMade → ExecutionSuccess
```

**示例：**
| 时间 | 事件 | 详情 |
|------|------|------|
| 15:00:00 | 📋 RouteEvaluated | route-a loaded |
| 15:00:01 | 📋 DecisionMade | ALLOW |
| 15:00:03 | 📋 ExecutionSuccess | ✅ on-chain |

---

### Module 7：NFT 成就系统

| 项目 | 说明 |
|------|------|
| 用途 | 交易量里程碑奖励，激励用户安全交易 |
| 定位 | 不是链上身份绑定，是成就徽章 |

**等级设计：**

| 等级 | 名称 | 解锁条件 |
|------|------|----------|
| 🥉 铜牌 | 铜牌探员 | 10 笔安全交易 |
| 🥈 银牌 | 银牌探员 | 50 笔安全交易 |
| 🥇 金牌 | 金牌探员 | 100 笔安全交易 |
| 💎 钻石 | 钻石探员 | 500 笔安全交易 |

**展示位置：** 用户 Profile 页 + 勋章墙 + 点击弹窗详情
**技术说明：** MVP 阶段链下记录，里程碑达标后触发 mint，P2 优先级

---

## 7. 页面结构

### 页面导航

```
P0: 连接钱包（产品入口）
    │
    ▼
P1: 仪表盘总览（安全总评分 + 多链状态 + 告警列表）
    │
    ▼
P2: 交易安全检测（输入 → 路径对比 → Agent决策）
    │
    ▼
P3: 执行结果 & 事件时间线
    │
    ▼
P4: 用户成就 & NFT 勋章
```

所有页面共用顶部导航栏：`[Logo] Sentinel | [Network ▼] | 🔗 Wallet`

---

## 8. MVP 范围

### ✅ 必须实现（P0）

| 模块 | 说明 |
|------|------|
| 钱包连接 | 链接钱包作为前置条件 |
| 交易输入 | Token In/Out/Amount 输入 |
| Route 展示 | 候选路径对比 + 风险评分 |
| Safety Agent 决策 | ALLOW / REJECT / FALLBACK 三种结果 |
| 执行结果 | 交易状态 + 节省对比 |
| 事件时间线 | RouteEvaluated → DecisionMade → ExecutionSuccess |
| Safe / Unsafe Mode | Demo 对比效果 |

### 🔜 第二阶段（P1）

| 模块 | 说明 |
|------|------|
| 仪表盘总览 | 多链安全状态 + 告警列表 |
| 4 项风险指标卡片 | 链/Token/合约/跨链 |

### 📅 后续迭代（P2）

| 模块 | 说明 |
|------|------|
| NFT 成就勋章墙 | 4 级探员勋章 |
| NFT 详情弹窗 | 点击查看详情 |
| Agent 人格设置 | 新手/老手模式 |

### ❌ 暂不实现

- 钱包管理
- 用户账户系统
- 历史交易分析
- 自动交易
- 复杂 AI 聊天助手

---

## 9. 技术交互需求

### 获取报价
```json
// GET /quote?tokenIn=USDT&tokenOut=USDC&amount=1000
// Response:
[
  {
    "routeId": "route-a",
    "label": "Safe Pool Route",
    "expectedOutput": 999,
    "riskScore": 15,
    "warnings": []
  },
  {
    "routeId": "route-b",
    "label": "Risky Pool Route",
    "expectedOutput": 800,
    "riskScore": 85,
    "warnings": ["high_quote_deviation", "high_failure_rate"]
  }
]
```

### 路径评估
```json
// POST /evaluate
// Request:
{
  "routeId": "route-b",
  "configProfile": "normal"
}
// Response:
{
  "decision": "REJECT",
  "riskScore": 84,
  "reason": "Quote deviation and failure risk exceed configured safety policy.",
  "flags": ["quote_deviation", "failure_risk"]
}
```

### 执行交易
```json
// POST /execute
// Request:
{
  "routeId": "route-a",
  "maxLossBps": 100,
  "deadline": 1721659999
}
// Response:
{
  "status": "success",
  "txHash": "0xabc...123",
  "loss": 10,
  "agentDecision": "ALLOW",
  "riskScore": 0
}
```

---

## 10. 产品未来方向

- 更多链上风险检测
- 跨链安全评估
- 恶意合约检测
- AI 交易助手
- 自动风险拦截
- 更多 NFT 成就等级 & 自定义形象
