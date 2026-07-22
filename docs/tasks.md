# 📋 Sentinel — 任务看板

> 来源：Lark 飞书多维表格  
> 更新日期：2026-07-23

---

## 角色与分工

| 角色 | 人员 | 主要方向 |
|------|------|---------|
| 🎨 设计 | 酷可可 | UI/UX 设计 |
| 💻 前端 | Joy Yu | 前端开发 |
| 🔗 Dev A | Milli | 链上执行（VaultExecution） |
| ⚙️ Dev B | Ni | 风险配置（Risk Config） |
| 📊 Dev C | Yu | 模拟数据（Mock Route） |
| 🔧 Dev D | Boring | 后端服务（Orchestration） |
| 🧠 Dev E | Zelll | Agent 规则引擎 |
| 📢 运营 | 77 | 产品运营 & 项目管理 |

---

## 全部任务

| 👤 角色 | 📋 任务 | 📅 交付日 | 🔗 协作对象 | ✅ 状态 | 🧭 主要方向 |
|---------|---------|-----------|------------|---------|------------|
| 🎨 设计 (酷可可) | 出 demo 页面结构图（低保真） | 周四 | 前端 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 定义 4 种状态视觉（Safe/Warning/Reject/Fallback） | 周四 | 前端 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 产出架构图草稿 + demo 流程图草稿 | 周四 | 全队 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 输出 icon/badge/状态样式给前端 | 周五 | 前端 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 架构图定稿 + demo 流程图定稿 | 周六 | 全队 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 导出最终素材（封面图/框图/截图） | 周日 | 运营 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 设计 4 级 NFT 勋章视觉（铜牌/银牌/金牌/钻石探员） | 周五 | 前端 | 待办 | UI/UX 设计 |
| 🎨 设计 (酷可可) | 设计 Profile 页勋章展示区 + NFT 详情弹窗 | 周六 | 前端 | 待办 | UI/UX 设计 |
| 💻 前端 (Joy Yu) | 初始化 React+Vite 前端项目 | 周四 | — | 待办 | 前端开发 |
| 💻 前端 | 写出单页布局骨架 | 周四 | 设计 | 待办 | 前端开发 |
| 💻 前端 | 接上真实 /quote /evaluate /execute | 周五 | Dev D | 待办 | 前端开发 |
| 💻 前端 | 展示 risk score、decision、reason | 周五 | Dev E | 待办 | 前端开发 |
| 💻 前端 | 做 loading/success/reject 三种状态 | 周五 | — | 待办 | 前端开发 |
| 💻 前端 | Safe Mode / Unsafe Mode 切换 | 周六 | — | 待办 | 前端开发 |
| 💻 前端 | 修UI阻塞 + 固定 demo 默认输入 | 周六 | — | 待办 | 前端开发 |
| 💻 前端 | 最后 bug 修复 + 锁定录屏版本 | 周日 | 运营 | 待办 | 前端开发 |
| 💻 前端 (Joy Yu) | 开发安全交易计数逻辑 + 里程碑检测 | 周五 | Dev D | 待办 | 前端开发 |
| 💻 前端 (Joy Yu) | 开发 Profile 页 + NFT 勋章墙展示 | 周六 | 设计 | 待办 | 前端开发 |
| 💻 前端 (Joy Yu) | 开发 NFT 详情弹窗 + mint 事件对接 | 周日 | Dev D | 待办 | 前端开发 |
| 🔗 Dev A (Milli) | 初始化合约项目 | 周四 | — | 待办 | 链上执行 |
| 🔗 Dev A | 写 VaultExecution.sol 骨架 + 定义 executeRoute() | 周四 | Dev D | 待办 | 链上执行 |
| 🔗 Dev A | 完成 executeRoute() 最小实现 | 周五 | Dev D | 待办 | 链上执行 |
| 🔗 Dev A | 打通执行成功/失败两种事件 | 周五 | Dev D | 待办 | 链上执行 |
| 🔗 Dev A | 确认链上执行路径稳定 + 最终 ABI | 周六 | 前端 | 待办 | 链上执行 |
| 🔗 Dev A | 锁合约版本 + 锁部署脚本 | 周日 | — | 待办 | 链上执行 |
| ⚙️ Dev B (Ni) | 写 risk-config.json 固定字段与默认值 | 周四 | Dev E | 待办 | 风险配置 |
| ⚙️ Dev B | 支持 profile 切换（normal/conservative） | 周五 | Dev E | 待办 | 风险配置 |
| ⚙️ Dev B | 固化默认值 + 参数翻译成自然语言 | 周六 | 运营 | 待办 | 风险配置 |
| ⚙️ Dev B | 锁 risk config 不再改阈值 | 周日 | — | 待办 | 风险配置 |
| 📊 Dev C (Yu) | 写出 3 条 route 样本初稿 + 预期 decision | 周四 | Dev E | 待办 | 模拟数据 |
| 📊 Dev C | 完成正式样本（route-a ALLOW / route-b REJECT / route-c FALLBACK） | 周五 | Dev D | 待办 | 模拟数据 |
| 📊 Dev C | 冻结 route 数据 + 录屏专用 demo route 集 | 周六 | 运营 | 待办 | 模拟数据 |
| 📊 Dev C | 锁 demo route 数据集 + 场景说明文档 | 周日 | 全队 | 待办 | 模拟数据 |
| 🔧 Dev D (Boring) | 起 backend 项目 + 建 4 个 API 路由占位 | 周四 | 全队 | 待办 | 后端服务 |
| 🔧 Dev D | 写 shared types + event service 骨架 | 周四 | 全队 | 待办 | 后端服务 |
| 🔧 Dev D | 发布第一版 api-contract.md | 周四 | 全队 | 待办 | 后端服务 |
| 🔧 Dev D | 串联 quote→evaluate→execute→events | 周五 | 全队 | 待办 | 后端服务 |
| 🔧 Dev D | event timeline 输出 + debug endpoint | 周六 | 前端 | 待办 | 后端服务 |
| 🔧 Dev D | 锁接口和服务环境 + 导出接口清单 | 周日 | 运营 | 待办 | 后端服务 |
| 🧠 Dev E (Zelll) | 定义 evaluateRoute() 输入输出类型 + 决策样例 JSON | 周四 | Dev B/C | 待办 | Agent 规则引擎 |
| 🧠 Dev E | 完成规则引擎 v0（3 条规则 + risk score） | 周五 | Dev B/C | 待办 | Agent 规则引擎 |
| 🧠 Dev E | 优化 reason 模板 + explanation formatter | 周六 | 运营 | 待办 | Agent 规则引擎 |
| 🧠 Dev E | 锁 Agent 规则与 reason + 30秒技术解释 | 周日 | 运营 | 待办 | Agent 规则引擎 |
| 📢 运营 (77) | 写一句话定位 + 30秒产品介绍草稿 | 周四 | 全队 | 待办 | 产品运营 |
| 📢 运营 (77) | 记录 scope freeze 结果 + 统一关键名词 | 周四 | 全队 | 待办 | 产品运营 |
| 📢 运营 (77) | 根据真实链路写 demo script v1 | 周五 | 前端 | 待办 | 产品运营 |
| 📢 运营 (77) | 写 demo script v2 + 90 秒版本 | 周六 | 设计 | 待办 | 产品运营 |
| 📢 运营 (77) | 准备 README 结构 + 提交材料清单 | 周六 | — | 待办 | 产品运营 |
| 📢 运营 (77) | 负责录屏流程 + 收口 README + 检查提交材料 | 周日 | 全队 | 待办 | 产品运营 |
