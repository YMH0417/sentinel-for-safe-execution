# Week 3 详细计划（周四 - 周日）

## 这 4 天到底要做什么

这 4 天不是做完整产品，也不是做完整基础设施平台，而是做出一个 **可稳定演示、可解释、可协作开发的 Execution Safety MVP**。这个 MVP 的核心不是“帮用户更激进地找利润”，而是“在交易真正发出前，识别明显高风险的路径，并选择放行、拒绝或切换到 fallback route”。

换句话说，Week 3 的目标不是把所有能力都做到位，而是把 **一条最小闭环链路** 做扎实：
1. 前端输入一笔 swap 请求。
2. Router / Quote Service 返回候选 route。
3. Safety Agent 对 route 做风险评估。
4. 系统输出 `ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE`。
5. Vault Execution 根据结果执行或拒绝。
6. 前端展示 risk score、decision、reason、event timeline。

如果周日能稳定演示这条闭环，并且每个模块接口清楚、代码能继续扩展到 Week 4，这个 Week 3 就是成功的。

## 这 4 天明确不做什么

为了保证协作效率，Week 3 不做任何会拖垮节奏、但又不直接贡献 Demo 闭环的事情。以下内容一律不进入本周 scope：

- 多链支持，不接 Ethereum、Base、Arbitrum 等多网络，只做一个可控环境。
- 多 Agent 编排，不做 Planner Agent、Executor Agent、Monitor Agent 的复杂协作。
- 真正自动套利，不做实时竞争式搜寻机会，不与外部 MEV 基础设施对接。
- 复杂治理，不做完善的 on-chain DAO config、投票或多角色权限。
- 复杂 LLM 决策，不让大模型决定交易生死，LLM 只做 explanation layer。
- 真实生产级行情服务，不接很多外部 DEX，只做 1 套可控 mock route / route simulator。
- 复杂图表大盘，不做完整 dashboard，只做 demo 所需的 route/result/timeline 展示。
- 复杂钱包兼容，不支持过多钱包，只要保证 demo 钱包可用即可。
- 高耦合重构，不在 Week 3 中途大改架构。

## Week 3 的交付标准

周日结束前，必须交出下面这些东西：

1. **可演示前端**：用户能输入交易参数并看到决策结果。
2. **Safety Agent v0**：能输出 allow / reject / fallback 三类结果。
3. **Vault Execution + Risk Config 最小闭环**：执行入口、参数约束和事件日志都可用。
4. **可复现的 demo 数据**：至少 3 条 route 场景，稳定触发不同决策。
5. **可讲的系统结构**：大家知道每个模块之间怎么连。
6. **可录屏的 demo 路径**：周日能连续录 2 次以上不过载、不翻车。

---

# 一、固定基础框架

这一部分是给团队“先定脚手架”，避免每个人从 0 开始各写各的，最后无法联调。

## 1.1 推荐技术栈

### 前端
- React
- TypeScript
- Vite
- Wagmi + Ethers
- Tailwind（或你们现有 UI 方案，但不要中途换）

### 后端 / Agent / Orchestration
- Node.js
- TypeScript 或 Python 二选一，但建议 **Node.js + TypeScript**，因为和前端、接口、mock 数据更容易统一
- Express / Fastify 均可，优先选最熟悉的

### 合约
- Solidity
- Foundry 或 Hardhat 二选一，但建议全队统一一种
- Monad testnet（如不稳定，可先本地 + mock）

### 数据与配置
- 本周不接数据库，直接用：
  - `mock-routes/*.json`
  - `config/risk-config.json`
  - `events/events.json` 或内存事件缓存

### LLM
- 本周不作为核心决策，只做 reason wording / explanation formatting
- 若接入模型，必须可选关闭，不影响主链路

## 1.2 推荐目录结构

下面是建议直接采用的目录结构，尽量不要临时发明：

```text
project/
├─ frontend/
│  ├─ src/
│  │  ├─ pages/
│  │  ├─ components/
│  │  ├─ services/
│  │  ├─ types/
│  │  └─ mocks/
├─ backend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ agent/
│  │  ├─ config/
│  │  ├─ events/
│  │  └─ types/
├─ contracts/
│  ├─ src/
│  ├─ script/
│  ├─ test/
│  └─ out/
├─ shared/
│  ├─ types/
│  └─ demo-data/
└─ docs/
   ├─ architecture.md
   ├─ api-contract.md
   └─ demo-script.md
```

## 1.3 固定数据结构

### Route 对象
所有模块统一使用这一套 route 结构，不允许每个人自己定义字段名。

```json
{
  "routeId": "route-b",
  "label": "Risky Pool Route",
  "tokenIn": "USDT",
  "tokenOut": "USDC",
  "amountIn": 1000,
  "quotedOut": 1002,
  "expectedOut": 992,
  "poolRiskScore": 85,
  "historicalFailureRate": 0.42,
  "supportsFallback": true,
  "fallbackRouteId": "route-a",
  "warningFlags": ["high_quote_deviation", "high_failure_rate"]
}
```

### Agent 决策对象

```json
{
  "decision": "REJECT",
  "riskScore": 84,
  "reason": "Quote deviation and failure risk exceed configured safety policy.",
  "routeId": "route-b",
  "fallbackRouteId": "route-a",
  "flags": ["quote_deviation", "failure_risk"]
}
```

### Event 对象

```json
{
  "eventType": "RouteEvaluated",
  "timestamp": 1721659200,
  "routeId": "route-b",
  "decision": "REJECT",
  "riskScore": 84,
  "message": "Route rejected by Execution Safety Agent"
}
```

## 1.4 固定 API 合同

不允许每天变字段名，否则前后端和 Agent 会一起爆炸。Week 3 先固定这 4 个接口。

### 1. 获取报价
```http
GET /quote?tokenIn=USDT&tokenOut=USDC&amount=1000
```

### 2. 评估路径
```http
POST /evaluate
Content-Type: application/json
```
```json
{
  "routeId": "route-b",
  "configProfile": "normal"
}
```

### 3. 执行路径
```http
POST /execute
Content-Type: application/json
```
```json
{
  "routeId": "route-a",
  "maxLossBps": 100,
  "deadline": 1721659999
}
```

### 4. 查询事件
```http
GET /events
```

## 1.5 固定 Agent 规则

Week 3 版本只允许 rule-based，不允许中途改成复杂模型自治。

### 输入
- `quotedOut`
- `expectedOut`
- `poolRiskScore`
- `historicalFailureRate`
- `supportsFallback`
- `fallbackRouteId`
- `riskConfig`

### 建议规则

#### Rule A：Quote Deviation
如果：
- `abs(quotedOut - expectedOut) / expectedOut > maxQuoteDeviationThreshold`
则标记 `quote_deviation`

#### Rule B：Failure Risk
如果：
- `historicalFailureRate > failureThreshold`
则标记 `failure_risk`

#### Rule C：Pool Risk
如果：
- `poolRiskScore > poolRiskThreshold`
则标记 `pool_risk`

### 决策建议
- `riskScore < 40` => `ALLOW`
- `40 <= riskScore < 70` 且 `supportsFallback = true` => `FALLBACK_TO_SAFE_ROUTE`
- `riskScore >= 70` => `REJECT`

### 固定配置建议
```json
{
  "maxLossBps": 100,
  "maxQuoteDeviationThreshold": 0.008,
  "failureThreshold": 0.20,
  "poolRiskThreshold": 70,
  "paused": false
}
```

---

# 二、8 个人分别做什么

## 2.1 前端（Demo App Owner）

前端不是简单“做个页面”，而是这个 Demo 的**主舞台搭建者**。评委和外部观众看不到合约内部逻辑，他们首先看到的是页面如何组织信息、用户点击后系统如何反馈、风险决策是否一眼能理解。所以前端在 Week 3 要承担两个职责：第一，做出一个稳定的 demo app；第二，把后端和合约返回的结果转译成可理解的 UI。

前端本周不要追求“像完整交易产品”，而是要追求“像一条被解释清楚的交易流程”。页面上最重要的不是图多漂亮，而是：用户输入 -> route 展示 -> agent 决策 -> 执行结果 -> timeline，这五步要清楚。

### 核心任务
- 搭一个单页 Demo App。
- 接 `quote`、`evaluate`、`execute`、`events` 四类接口。
- 做出 Safe Mode / Unsafe Mode 两种演示路径。
- 展示 risk score、decision、reason、timeline。
- 保证周日录屏时不需要手动改代码。

### 需要特别注意
- 所有接口字段统一使用 shared types。
- 不要在前端自己重新算 risk score。
- 前端只负责展示，不负责定义业务规则。
- 页面按钮命名要适合 demo，例如：`Run Without Safety`、`Run With Safety Agent`。

## 2.2 设计（Demo Narrative Designer）

设计不是来“美化页面”的，而是来解决**认知压缩**问题。Execution Safety 这个概念对评委来说不是天然直观的，因此设计最核心的工作是把复杂后端逻辑压缩成几个非常明确的视觉模块：候选 route、风险判断、系统动作、执行结果。设计本周不做大而全系统，不做品牌深度，只做 Demo 所需的清晰表达。

设计还要承担一个关键任务：提前决定页面结构和状态规范，让前端不再临时拍脑袋。比如 Safe / Warning / Reject / Fallback 四种状态的颜色、边框、icon、badge 样式，需要设计先定下来，否则前端会边写边猜。

### 核心任务
- 出 demo 页面结构图。
- 定义风险状态系统。
- 定义 timeline 视觉结构。
- 定义一张架构图和一张 demo 流程图。
- 给运营和前端统一视觉叙事。

## 2.3 Dev A（Vault Execution Owner）

Dev A 是链上执行负责人，不是“随便写个合约”。他的任务是把系统最后那一步——执行——变成稳定可控的模块。Week 3 里链上逻辑一定要**少而稳**，因为前面 Agent 决策再漂亮，如果执行层不稳定，整个 demo 就没有可信度。Dev A 必须明确：本周合约不需要像生产级路由器，只需要像一个“安全执行闸门”。

因此 Dev A 的关键不是实现所有策略，而是实现一个最小执行函数和清楚的事件回传。合约接口必须让 Dev D、前端和运营都能理解：什么时候发起、什么时候执行成功、什么时候被拒绝、拒绝原因是什么。

### 核心任务
- 实现 `executeRoute()` 最小入口。
- 保留 `maxLossBps`、`deadline`、`paused` 这些硬约束。
- 统一事件：请求、成功、失败。
- 提供 ABI 和可复用脚本。
- 确保演示时至少有 1 条成功执行路径和 1 条被拒绝路径。

### 与其他 Dev 的协作点
- 与 Dev B 对齐 config 的读取方式。
- 与 Dev C 对齐 routeId 的映射关系。
- 与 Dev D 对齐 execute API 入参。
- 与 Dev E 对齐“被拒绝”时是后端挡掉还是链上也要挡一次。

## 2.4 Dev B（Risk Config Owner）

Dev B 负责把“风控参数”做成全队共享的底层约束，而不是散落在每个文件里的魔法数字。Week 3 很多联调事故都会来自这里：前端用一套阈值，Agent 用另一套阈值，执行层又没有同步，最后大家看起来都对，但结果完全不一致。Dev B 的工作就是把风险策略固化成一份统一的配置。

本周 Risk Config 不追求链上治理感，而追求**团队协作中的单一事实源**。也就是说，不管是 Agent 还是 execute，最终都应该基于同一份配置做判断。Week 3 如果时间紧，宁愿先做 JSON config + service loading，也不要做一半 on-chain governance 又没有人会用。

### 核心任务
- 统一风险配置 schema。
- 维护默认阈值。
- 支持切换 2–3 个 profile。
- 提供配置读取接口。
- 帮团队解释每个参数的业务含义。

### 与其他 Dev 的协作点
- 与 Dev E 对齐所有阈值名和计算方式。
- 与 Dev A 对齐 `maxLossBps`、`paused` 等执行限制。
- 与 Dev D 对齐 config profile 的接口字段。
- 与运营一起把参数翻成评委听得懂的话。

## 2.5 Dev C（Market Simulation / Mock Route Owner）

Dev C 是整个 Demo 的“现实世界建模者”。Week 3 不接一堆真实 DEX，因此所有风险场景、route 差异、fallback 逻辑，都依赖 Dev C 的 mock 数据设计。如果 mock 场景太弱，Agent 看不出差异；如果 mock 场景太复杂，大家会联不起来。Dev C 的目标不是“越真实越好”，而是“越稳定越好”。

简单说，Dev C 要做的是：给全队一套可以放心拿来开发、测试、录屏的 route 样本，而且这些样本必须稳定触发 allow / reject / fallback 三种决策。没有这一层，前端没法展示、Agent 没法判断、运营没法讲故事。

### 核心任务
- 设计 3 条核心 route。
- 准备 route JSON 和字段文档。
- 提供伪历史失败率、预期输出、报价偏差等字段。
- 和 Dev E 一起微调样本，让风险评分直观。
- 冻结一套录屏专用 demo 数据。

### 与其他 Dev 的协作点
- 与 Dev E 对齐 route 输入字段。
- 与 Dev D 对齐 `/quote` 返回结构。
- 与前端对齐展示字段顺序。
- 与运营对齐哪一条 route 用来讲“错误路由”故事。

## 2.6 Dev D（Orchestration / Backend Owner）

Dev D 是 Week 3 里最关键的“胶水层”。前端、Agent、Mock Route、合约，如果没有一个稳定中间层把它们串起来，所有人都只能各自本地跑通，永远无法形成一个真实 Demo。Dev D 的目标不是做完整后端，而是做一个**最小可观测、最小可调试、最小可串联**的 orchestration service。

Week 3 的中间层一定要偏“简单但稳定”。所有接口固定、字段固定、流程固定。比起用很多抽象框架，Dev D 更应该优先保证：前端发一个请求，后端能稳定返回 route；点一次 evaluate，能拿到稳定决策；点 execute，能拿到稳定事件流。

### 核心任务
- 起后端服务。
- 定义并实现 4 个核心 API。
- 串联 quote -> evaluate -> execute -> events。
- 维护事件日志和 debug 输出。
- 成为全队联调入口。

### 与其他 Dev 的协作点
- 与前端对齐 request/response contract。
- 与 Dev C 对齐 mock route 读取方式。
- 与 Dev E 对齐 evaluate service 的入参和返回。
- 与 Dev A 对齐 execute service 的调用和事件。

## 2.7 Dev E（Execution Safety Agent Owner）

Dev E 虽然是偏 LLM 的同学，但 Week 3 里最重要的不是“把 LLM 接上”，而是把 Agent 做成一个稳定、明确、可解释的风险判断模块。也就是说，Dev E 的本周目标是 **先做风控决策引擎，再做自然语言包装层**。先有靠谱 decision，再谈 AI 感。

因此 Dev E 必须非常克制：Agent v0 的核心决策逻辑用规则实现，确保 deterministic；LLM 只在最后一层把 reason 变得更可读。如果一开始就依赖模型生成决策，你们会在 Week 3 直接失去稳定性，无法 demo。

### 核心任务
- 定义 evaluate 输入输出 schema。
- 实现风险评分逻辑。
- 输出三类决策。
- 生成用户可读 reason。
- 如有余力，再补 explanation formatter。

### 与其他 Dev 的协作点
- 与 Dev B 对齐全部阈值。
- 与 Dev C 对齐 route 字段。
- 与 Dev D 对齐 evaluate API。
- 与前端对齐 reason 和 flags 的展示方式。

## 2.8 运营（Story + Delivery Owner）

运营不是最后一天来写 README，而是本周一直在做“让团队知道自己在做什么”的那个人。Execution Safety 这个叙事如果不持续收口，团队很容易又跑回“套利 Agent”“智能交易”这类泛叙事里。运营需要从第一天开始就盯住一句话：我们不是帮用户更贪心，而是帮用户避免错误执行。

运营还要负责所有外部表达材料：一句话定位、demo script、README 结构、录屏台词、页面中的解释文字。Week 3 里很多内容会反复变，但这条产品叙事不能变。

### 核心任务
- 统一对外 story。
- 写 30 秒、90 秒两版 demo script。
- 和设计一起收口页面文案。
- 和 Dev E 一起收口 reason 文案。
- 周日负责最终录屏与提交物检查。

---

# 三、Dev 之间必须怎么沟通

为了避免“每个人都在做，但没有真正合起来”，Dev 团队必须固定下面 4 个同步点。

## 3.1 每天上午第一次同步：接口同步
负责人：Dev D

要同步的内容：
- 今天接口有没有变更。
- 今天 route schema 有没有增删字段。
- 今天 config 是否调整。
- 今天 Agent 输出有没有新增字段。

输出：
- 更新 `docs/api-contract.md`
- 在群里发一版固定 JSON 样例

## 3.2 每天下午第二次同步：联调同步
负责人：Dev D + 前端

要同步的内容：
- 前端是否能实际跑通。
- 哪个接口坏了。
- 哪条 route 没有触发正确结果。
- 是前端展示问题、Agent 问题还是合约问题。

输出：
- 一个联调状态表
- 当日 blocker 清单

## 3.3 每晚收口：Demo 同步
负责人：运营

要同步的内容：
- 今天 Demo 路径是否更稳定。
- 今天是否仍然围绕“Execution Safety”这个叙事。
- 哪些功能应砍掉。

输出：
- 次日优先级列表
- 一条最稳 demo 路径

## 3.4 Dev 专项固定文档
必须有人维护，不然第二天一定乱：
- `docs/api-contract.md`：Dev D 维护
- `shared/demo-data/routes.json`：Dev C 维护
- `backend/src/config/risk-config.json`：Dev B 维护
- `docs/architecture.md`：Dev D + 设计联合维护
- `docs/demo-script.md`：运营维护

---

# 四、4 天逐日计划

## Day 1：周四 —— 框架定型日

### 当天目标
周四不是拼功能数量，而是把所有人拉到同一条开发轨道上。今天最重要的事情不是“做出很多页面”或者“写完很多合约”，而是**把系统骨架定死**，这样周五周六才能真正并行开发。周四如果没有完成架构定型和接口定型，后面三天会全部浪费在改字段、改流程、改认知上。

所以周四的成败标准只有一个：到晚上时，全队已经共享同一套 route schema、agent schema、config schema、API contract 和 demo 路径。功能可以不完整，但骨架必须完整。

### 每个人今天要做什么

#### 前端
- 初始化 frontend 项目。
- 写出单页布局骨架：Header / Input / Route List / Safety Panel / Result / Timeline。
- 用假数据先把页面结构挂起来。
- 和设计确认所有状态位和颜色。
- 和 Dev D 对齐接口占位。

#### 设计
- 产出低保真结构图。
- 决定 4 个状态视觉：Safe / Warning / Reject / Fallback。
- 决定页面信息顺序。
- 产出架构图草稿和 demo 流程图草稿。

#### Dev A
- 初始化合约项目。
- 写 `VaultExecution.sol` 骨架。
- 定义 `executeRoute()` 入参。
- 定义事件名。
- 本地跑一次最小测试。

#### Dev B
- 写 `risk-config.json`。
- 固定字段与默认值。
- 写一页参数说明。
- 和 Dev E 统一阈值意义。

#### Dev C
- 写出 3 条 route 样本初稿。
- 固定字段名。
- 给每条 route 标注“预期 decision”。
- 输出 `routes.json` 第一版。

#### Dev D
- 起 backend 项目。
- 建 4 个 API 路由占位。
- 写 shared types 或至少写接口样例。
- 建 event service 骨架。
- 发布第一版 `api-contract.md`。

#### Dev E
- 写 `evaluateRoute()` 的输入输出类型。
- 固定 risk score 计算大框架。
- 先不接 LLM，先写规则占位。
- 发布第一版决策样例 JSON。

#### 运营
- 写一句话定位。
- 写 30 秒产品介绍草稿。
- 记录今日 scope freeze 结果。
- 整理大家今天定下来的关键名词，保证口径统一。

### 周四验收标准
- 有统一目录结构。
- 有统一 route schema。
- 有统一 evaluate schema。
- 有统一 API contract。
- 前端页面骨架可打开。
- 后端接口可访问。
- 合约骨架已存在。

## Day 2：周五 —— 主链路打通日

### 当天目标
周五的任务是把周四定下来的“空骨架”变成第一条真正跑通的链路。也就是说，今天结束时，应该可以从前端发起一笔模拟交易请求，然后经过 quote -> evaluate -> execute/reject 走完一遍，不要求全部好看，但必须真实通一次。

周五最容易出的问题是：每个人都还在补自己的模块，没人真正联调。所以今天所有工作都要围绕“打一条主链路”展开，而不是继续各做各的 feature。

### 每个人今天要做什么

#### 前端
- 接上真实 `/quote`。
- 接上真实 `/evaluate`。
- 接上 `/execute` 的返回结构。
- 在页面展示 risk score、decision、reason。
- 做 loading / success / reject 三种状态。

#### 设计
- 对前端页面做第一轮落地指导。
- 明确组件优先级：Risk Panel 第一、Route List 第二、Timeline 第三。
- 输出 icon / badge / 状态样式给前端。

#### Dev A
- 完成 `executeRoute()` 最小实现。
- 提供 mock 或真实链上返回。
- 打通“执行成功”和“执行失败/拒绝”两种事件。
- 和 Dev D 联调 execute service。

#### Dev B
- 提供 config 读取方法。
- 支持 profile：`normal`、`conservative`。
- 和 Dev E 一起验证同一份阈值是否真正被使用。
- 确保 config 改动能影响 decision。

#### Dev C
- 完成 3 条 route 的正式样本。
- 让 route-a 必然 allow。
- 让 route-b 必然 reject。
- 让 route-c 必然 fallback。
- 输出给 Dev D 直接读取的 JSON。

#### Dev D
- 串联 `/quote` -> `/evaluate` -> `/execute`。
- 将 Dev C route 数据接入 quote service。
- 将 Dev E evaluate 逻辑接入 evaluate service。
- 将 Dev A execute 逻辑接入 execute service。
- 记录全流程 event。

#### Dev E
- 完成规则引擎 v0。
- 实现 risk score 计算。
- 返回 `ALLOW / REJECT / FALLBACK_TO_SAFE_ROUTE`。
- 给出 flags 和 reason。
- 和 Dev C 一起调样本直到结果直观。

#### 运营
- 根据真实链路，写 demo script v1。
- 和前端一起看页面上哪些文案最容易让人懂。
- 记录今天联调问题，方便周六收口。

### 周五验收标准
- 前端能从真实接口拿到 route。
- evaluate 返回真实 decision。
- execute 至少能跑通 1 次。
- 三种 route 至少有 2 种决策已稳定出现。

## Day 3：周六 —— Demo 成型日

### 当天目标
周六的重点是把“能跑”变成“能讲”。很多团队在这里会犯错：继续写更多底层功能，结果到周日发现没有一个像样的 demo。你们周六应该把重点转向体验和叙事，让评委可以在 1–2 分钟内理解：为什么普通路由会有风险，为什么 Safety Agent 能阻止错误执行。

这一天也要开始为录屏做准备，意味着所有不直接影响 demo 的新想法都要谨慎。周六不是做更多，而是做更清楚。

### 每个人今天要做什么

#### 前端
- 做出 Safe Mode / Unsafe Mode 切换。
- 展示 Route List、Decision、Reason、Result、Timeline 完整流程。
- 增加 fallback 的展示逻辑。
- 修掉明显 UI 阻塞和状态跳闪问题。
- 固定 demo 默认输入。

#### 设计
- 补一轮视觉统一。
- 确保 4 种状态可一眼区分。
- 输出架构图定稿。
- 输出 demo 流程图定稿。

#### Dev A
- 确认链上执行路径稳定。
- 提供最终 ABI 和部署地址（如果已上测试网）。
- 配合前端验证 result 展示字段。
- 减少不必要 revert 原因波动。

#### Dev B
- 固化风险配置默认值。
- 如果需要，提供 profile 切换说明。
- 与运营一起把参数翻译成自然语言，例如“报价偏差超过阈值”。

#### Dev C
- 冻结 route 数据。
- 不再新增 route，只微调数值。
- 确保三种场景都符合直觉。
- 准备录屏专用 demo route 集。

#### Dev D
- 做 event timeline 输出。
- 保证接口错误时也有稳定错误返回。
- 加一个 debug endpoint 或 console log 模式，方便当天排查。
- 确保服务重启后 demo 仍能跑。

#### Dev E
- 优化 risk score 阈值。
- 增加更自然的 reason 模板。
- 如有余力，加 explanation formatter：
  - user-facing version
  - judge-facing technical version
- 但不改变底层 deterministic 逻辑。

#### 运营
- 写 demo script v2。
- 写 90 秒讲解版本。
- 和设计一起确定页面上最终话术。
- 开始准备 README 结构和提交材料清单。

### 周六验收标准
- Demo 页面完成主体。
- 三类路径可被解释。
- 至少完成一次完整彩排。
- 大家知道明天录屏怎么走。

## Day 4：周日 —— 封版与录屏日

### 当天目标
周日一律不再扩功能，只做稳定、封版、录屏和文档。所有人今天的第一原则是：宁愿少一点，也要稳定。如果周日还在加大功能，基本等于主动制造风险。

这一天的工作是把前三天做出来的系统变成“交付物”：能录、能讲、能解释、能提交。所有不稳定点都要在今天上午解决，下午只允许录屏和文档收口。

### 每个人今天要做什么

#### 前端
- 修最后 bug。
- 固定 demo 输入和按钮顺序。
- 把页面中不必要的选项隐藏掉。
- 确保录屏时不会出现空白态或无数据态。

#### 设计
- 导出最后一版图示。
- 检查所有状态颜色和标签一致性。
- 补必要的封面图、框图或截图素材。

#### Dev A
- 锁合约版本。
- 锁部署脚本。
- 提供最终 ABI 和执行说明。
- 不再改动核心逻辑，除非是阻塞 bug。

#### Dev B
- 锁 risk config。
- 输出最终参数表。
- 不再改阈值，除非直接影响 demo 正确性。

#### Dev C
- 锁 demo route 数据集。
- 确保录屏环境始终读同一套 route。
- 输出一页“场景说明”。

#### Dev D
- 锁接口和服务环境。
- 确保 event timeline 正常。
- 支持现场快速重启服务。
- 导出一份接口清单。

#### Dev E
- 锁 Agent 规则与 reason。
- 准备 30 秒技术解释：Agent 如何判断。
- 确保即便 LLM 层挂掉，规则层仍能跑。

#### 运营
- 负责录屏流程。
- 收口 README。
- 整理项目一句话、问题定义、解决方案、demo 流程、团队分工。
- 检查所有提交材料是否齐全。

### 周日验收标准
- 连续 2 次完整 demo 无重大问题。
- 所有文案口径统一。
- 所有人知道最终讲述方式。
- 代码、配置、录屏路径都已冻结。

---

# 五、每位 Dev 的最小交付物

## Dev A
- `VaultExecution.sol`
- `executeRoute()` 可调用
- success / fail 事件
- 部署脚本

## Dev B
- `risk-config.json`
- profile 方案
- 参数说明

## Dev C
- `routes.json`
- 3 条核心 route
- 场景说明文档

## Dev D
- backend service
- 4 个 API
- event service
- `api-contract.md`

## Dev E
- `evaluateRoute()`
- risk score 逻辑
- reason 模板
- 说明文档

---

# 六、最后的执行原则

Week 3 的本质不是“做出一个完整智能交易平台”，而是做出一个**有明确边界、能稳定协作、能讲清价值的执行安全闭环**。这意味着：所有人都应该围绕固定架构、固定字段、固定 API 和固定 demo 路径工作，而不是各自探索最优解。

你们真正要赢下来的，不是功能数量，而是清晰度和完成度。只要周日能稳定回答这三个问题，这个 Week 3 就是成功的：
- 这系统做什么？
- 它怎么做？
- 为什么它比“只看报价直接执行”更安全？
