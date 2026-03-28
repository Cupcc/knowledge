---
title: AI Coding Agent 编排架构
description: 从角色体系、知识管理到编排工作流，系统梳理 AI Coding Agent 的协作设计。
---

# AI Coding Agent 编排架构设计

基于 Cursor IDE + Claude/GPT 的多智能体编排架构实践笔记。本文记录了在真实 NestJS WMS 项目中逐步演进出的 Agent 协作体系: 从角色划分、知识管理到工作流编排的完整设计思路。

> 当前状态：已完成详细版  
> 阅读建议：建议先读完 [大模型基础认知](/basics/llm-overview) 和 [Prompt Engineering 入门](/basics/prompt-engineering)，再阅读本文。

## 先看结论

如果把大模型看成能力底座，那么 Agent 更像是在这个底座上叠加“任务拆解、工具调用、状态管理、验证与协作机制”的系统层。本文的重点，不是单个 Prompt，而是如何把多个角色、文档、验证步骤和经验沉淀组织成一个可持续迭代的工作流。

## 1. 设计哲学

| 原则 | 说明 |
|---|---|
| 简洁优雅 | 用最小开销解决问题，节省 token 消耗 |
| 自主决策 | 尽量自主推进，只在重大决策点（架构变更、数据库表变更）停下确认 |
| 渐进式披露 | 不一次性加载全部上下文，按需读取最小相关文件 |
| 依靠工具 | 用工具验证事实，不靠主观判断和记忆 |
| 基于文件系统 | 所有状态、通信、经验都持久化到文件，不依赖聊天记忆 |

## 2. 角色体系

### 2.1 Main Agent（编排者）

编排者是整个工作流的中枢。它不直接写大量代码，而是负责：

- **分流决策**：判断任务走轻量直接通道还是重型编排流程
- **子智能体调度**：按 `plan → code → review → fix → commit → retrospect` 顺序派发工作
- **通信枢纽**：接收子智能体的 handoff 报告，做合并和冲突判断
- **质量关卡**：只有在验证通过、审查清零、用户确认后才执行 commit
- **经验沉淀**：在 retrospect 阶段回顾全流程，写入 playbook

编排者的关键行为准则：

- 执行系统性任务时阶段性停止，介入人工测试
- 做重大决策时停止等待用户确认（架构变更、数据库表变更）
- 不盲目相信文档——出现困惑或冲突时调用工具、执行测试验证
- 除非文件写入范围不冲突，否则同一时间只运行一个 coder
- 子智能体之间依靠文件系统通信，不依赖聊天记忆传递

### 2.2 Planner（规划者）

规划者在动手之前做调研和拆解：

- 调查 API 和最佳实践，确保不使用废弃 API，不用不符合当前版本的写法
- 撰写参考资料（`docs/dependencies/`）供 coder 查阅，避免每次都重新调查
- 将项目计划写入 `docs/tasks/*.md`，作为 coder 的执行简报
- 输出：任务目标、影响文件、实施步骤、风险点、验证命令、并行安全性判断

### 2.3 Coder（执行者）

执行者按照规划者的执行简报实施：

- 优先查看参考资料（`docs/dependencies/`、`docs/playbooks/`），避免重复调研
- 严格执行计划，不擅自扩大范围
- 执行结果和困惑反馈给 Main Agent
- 受限于明确的可写路径，不触碰冻结边界

### 2.4 Reviewer（审查者）

审查者是质量守门人：

- 依靠工具调查事实、分析结果，不完全靠主观分析
- 依靠 lint、test、类型检查等工具，而不是肉眼扫描
- 更新审查文档，写入 `docs/fix-checklists/`
- 输出：findings（按严重度排序）、修复指令、验证判断

### 2.5 模型选择策略

不同角色对模型能力的要求不同，应自动路由或手动选择以节省 token：

| 角色 | 推荐模型等级 | 原因 |
|---|---|---|
| 项目规划 | xhigh | 需要深度推理、跨模块分析、风险预判 |
| 代码执行 | high | 需要准确实现，但范围已被规划约束 |
| 代码审查 | xhigh | 需要独立判断正确性、发现隐含风险 |
| 轻量任务 | fast | 简单编辑、格式修复、文档调整 |

## 3. 编排工作流

### 3.1 双通道分流

```text
用户请求
   ↓
 [分流判断]
   ├── 轻量直接通道：单文件、无跨模块、无冻结边界
   │   → 直接编辑 → 聚焦验证 → 完成
   │
   └── 重型编排流程：多文件、跨模块、有设计决策
       → plan → code → review → fix → commit → retrospect
```

轻量通道的判断信号：

- 单文件或极小路径集
- 无跨模块设计选择
- 不涉及迁移、回填、对账语义
- 不触碰共享合约或冻结边界
- 无需 task doc 来安全恢复

### 3.2 重型编排流程

```text
1. plan        Planner 调研、拆解任务、撰写执行简报
                 ↓
2. code        Coder 按简报实施、产出代码变更
                 ↓
3. review      Reviewer 审查正确性、回归、测试覆盖
                 ↓
4. fix         如有 blocking/important 发现 → 回到 Coder 修复 → 重新 review
                 ↓
5. commit      编排者验证全部通过后执行提交
                 ↓
6. retrospect  编排者回顾全流程，沉淀经验到 playbook
```

review → fix 是一个修复循环，不是停止点。只有 reviewer 报告所有 blocking 和 important 发现已清零，才能推进到 commit。

### 3.3 需求与 Workspace 驱动

非轻量任务仍遵循需求先行，`workspace` 作为正式的"工作交代区 + 探索草稿区"，既服务人类决策，也作为 AI 恢复上下文和判断下一步的入口。

```text
docs/requirements/*.md        正式需求真源（用户需求 + 当前进展 + 待确认）
         ↓
docs/workspace/DASHBOARD.md   全局入口（当前状态 + 需要你确认的 + AI 待办）
         ↓
docs/workspace/<workflow>/    工作流工作区（README + draft + decisions）
         ↓
docs/tasks/*.md               任务执行简报（AI 自主规划区）
         ↓
代码实施 + 验证
         ↓
同步进展回 requirement + Dashboard/README/draft/decisions
```

Requirement 文档记录: `用户需求`、`当前进展`、`待确认`，是正式口径和确认状态的真源。

Workspace 记录:

- `DASHBOARD.md`: 全局当前状态、待用户确认项、AI 待办、活跃工作流、已归档工作流
- 工作流 `README.md`: 面向人类的当前状况、阶段、背景、里程碑、资产索引
- `draft.md`: 头脑风暴、意图假设、澄清过程、对话留痕
- `decisions.md`: 待决策项与已决策日志，保持结论化和可追溯
- `*-explainer.md`: 对复杂概念或 trade-off 的详细解释，供 `decisions.md` 链接引用

Task 文档记录: 执行范围、实施步骤、验证状态、审查结论、恢复点。

关键边界:

- `draft.md` 可以承接探索期草稿，但不是 requirement 的替代品
- 发给用户确认的问题，应从 `draft.md` 提炼回 requirement 的 `待确认`
- 已明确的方案结论写入 `decisions.md`
- 执行计划、验证、review 结论仍属于 task doc

## 4. 知识管理体系

### 4.1 知识阶梯

知识按成熟度分四级存储，每一级有不同的准入门槛和生命周期：

```text
L4  .cursor/rules/*.mdc              冻结规则（跨任务不变的硬约束）
L3  .cursor/skills/*/SKILL.md        结构化技能（稳定的执行流程）
L2  docs/playbooks/*/playbook.md     领域经验（可进化的战术知识）
    docs/playbooks/*/*.ts|sh         自动化脚本（经验的可执行化）
L1  docs/tasks/*.md                  任务状态（单任务生命周期）
```

此外还有两个正交层，不属于知识成熟度阶梯，但在编排中不可或缺：

```text
docs/workspace/**                    决策与 Draft 工作区（人类决策支持 + AI 恢复上下文）
docs/requirements/*.md               用户交互层（意图 + 状态）
```

### 4.2 知识生命周期

```text
任务执行中发现经验
       ↓
  docs/playbooks/{domain}/playbook.md    追加文字条目（成熟度: 初步观察）
       ↓ 同一检查步骤出现 2+ 次
  docs/playbooks/{domain}/*.ts           提炼为可执行脚本
       ↓ 后续任务验证
  playbook.md 中更新成熟度为 "已验证 ✓"
       ↓ 领域经验足够结构化、流程稳定
  .cursor/skills/{domain}/SKILL.md       提升为技能（引用 playbook）
       ↓ 某条经验足够冻结、足够通用
  .cursor/rules/*.mdc                    提升为硬规则
  playbook.md 中标注 "已提升 → rules/xxx.mdc"
```

### 4.3 各层级的写入标准

| 层级 | 写入条件 | 不应写入 |
|---|---|---|
| L4 规则 | 已确认、跨任务稳定、不含 secrets | 临时阻塞、一次性修复、分支状态 |
| L3 技能 | 流程稳定、可重复执行 | 还在迭代的实验性方法 |
| L2 经验 | 非显而易见的模式、教训、边界案例 | 众所周知的库行为（放 dependencies） |
| L1 任务 | 当前任务的运行时状态 | 跨任务复用的知识 |

### 4.4 Rules 的使用原则

- 将硬性的、长期的约束写入 rules（如环境信息、冻结的业务规则）
- 将每次都需要查看的信息写入 rules（如开发环境版本）
- rules 信息尽量简洁，避免膨胀
- 不写入临时状态、一次性修复、分支特定的 workaround

## 5. 记忆与通信系统

### 5.1 设计目标

| 目标 | 实现方式 |
|---|---|
| 子智能体间通信 | 通过 `docs/tasks/*.md` 和 handoff 报告传递 |
| 避免对话中重要信息丢失 | 关键状态写入文件，不依赖聊天记忆 |
| 避免常用信息反复调用工具获取 | 本地缓存到 `docs/dependencies/`、`docs/playbooks/` |
| 避免 AI 反复犯同一个错误 | 经验沉淀到 playbook，成熟后提升为 rule |

### 5.2 Handoff 机制

每个子智能体结束时必须返回结构化报告：

- 任务文档路径
- 变更摘要
- 触碰的文件和合约
- 已跑和待跑的验证
- 风险、阻塞、签收需求
- 需求文档同步行（阶段进度 / 当前状态 / 阻塞项 / 下一步）
- `decision_candidates`（可选）：执行中发现的需要人类决策的事项，包含问题、选项、trade-off 和推荐

编排者收到 handoff 后：

- 执行进展 → 同步到 requirement 的 `当前进展`
- 需要用户决策的事项 → 写入 `docs/workspace/<workflow>/decisions.md`
- 值得持久化的探索草稿 → 写入 `docs/workspace/<workflow>/draft.md`
- 工作流状态变化 → 更新 `docs/workspace/DASHBOARD.md`
- 对话结束前 → 将续接状态写入 task doc，确保下一个会话能无损恢复

### 5.3 跨会话续接

当用户说"继续"时：

1. 先读取 `docs/workspace/DASHBOARD.md`
2. 定位对应 `docs/workspace/<workflow>/README.md`，必要时补读 `draft.md` / `decisions.md`
3. 再读取关联的 requirement doc、task doc、fix-checklist、报告文件
4. 重建：当前范围、已完成步骤、已通过验证、剩余阻塞、下一个安全动作
5. 不从头重新规划，除非文档过时或用户明确要求

## 6. API 与依赖工作流

### 6.1 四级查找顺序

```text
1. 本地版本确认    package.json + pnpm-lock.yaml
       ↓
2. 本地参考文档    docs/dependencies/<slug>.md（需 Refresh status 已验证）
       ↓
3. Context7 刷新   实时查询最新 API 文档和最佳实践
       ↓
4. Web 搜索兜底    官方文档、GitHub issues、breaking changes、forum、blog
```

### 6.2 依赖文档结构

每个依赖一个文件，标准化 section：

- Local Version Snapshot — 锁定版本
- Context7 Resolve Result — 可复现的查询记录
- Recommended APIs — 推荐用法 + 最小示例
- Deprecated Or Avoid — 废弃 API 和替代方案
- Repo Usage Notes — 本项目特有的封装和约定
- Refresh Triggers & Checklist — 何时刷新、如何刷新

核心原则：**不从记忆写 API，确认 API 存在且未废弃再使用。**

## 7. 工具优先原则

| 场景 | 正确做法 | 错误做法 |
|---|---|---|
| 获取执行时间 | 调用工具 / 编写脚本计时 | 估计 |
| 修复代码格式 | 先跑 formatter 和 linter | AI 手动修格式 |
| 验证正确性 | 运行 test 脚本 | 只靠主观判断 |
| 确认 API 版本 | 查 package.json + Context7 | 从记忆回忆 |
| 验证文档真实性 | 执行测试、调用工具 | 盲目相信文档 |

## 8. 功能模块总览

### 8.1 核心模块

| 模块 | 职责 |
|---|---|
| Orchestration | 编排智能体协作工作流程，分流决策 |
| Subagents | 定义各种 agent 角色和技能 |
| 通信 (Handoff) | 基于文件系统的交接通信，确保信息不丢失 |
| Rules | 收集环境信息，维护共享的强制性、固定的、长期的规则 |
| 参考资料 (Dependencies) | AI 撰写和收集的外部库参考资料 |
| 需求 (Requirements) | 人和 AI 的交互区，AI 协助完成需求文档 |
| 工作区 (Workspace) | 工作交代区 + 探索草稿区，承载 Dashboard、进展叙事、用户待确认、AI 待办、draft、决策日志与辅助资产 |
| 任务 (Tasks) | AI 自主规划区域，拆分任务、监控执行、交代结果 |
| 审查 (Fix Checklists) | 审查结果的持久化记录 |
| 经验 (Playbooks) | 避免反复犯错，常用工作流固化 |

### 8.2 辅助模块

| 模块 | 职责 |
|---|---|
| Scripts | AI 利用的各种脚本工具（迁移、验证、报告生成） |
| Skills | AI 利用的各种结构化技能（编排、迁移、审查流程） |
| Test | 审查 AI 工作质量的各种测试 |
| Hooks | 监控 AI 进度发送飞书消息、触发代码格式化等 |

### 8.3 工作区（Workspace）

Workspace 是独立于 requirement 和 task 的第三层，定位为"决策与 Draft 工作区"。它既服务人类决策者，也服务 AI 恢复上下文和继续推进工作。核心目标是: **让人类快速理解全局，让 AI 不依赖聊天记忆继续工作。**

#### 8.3.1 三层定位

| 文档层 | 回答的问题 | 服务对象 |
|--------|-----------|---------|
| `docs/requirements/*.md` | 用户要什么 + 当前执行状态 + 还待确认什么 | 意图确认 |
| `docs/workspace/**` | 当前到哪了、要决定什么、有哪些想法仍在草拟、AI 下一步做什么 | **人类决策者 + AI 恢复上下文** |
| `docs/tasks/*.md` | 怎么执行、谁负责、交接什么 | Agent 执行链 |

#### 8.3.2 目录结构

```text
docs/workspace/
├── README.md                           # 机制说明
├── DASHBOARD.md                        # 全局入口：当前状态 / 待确认 / AI 待办
├── <workflow-name>/                    # 活跃工作流，纯语义命名
│   ├── README.md                       # 工作流入口与当前状况
│   ├── draft.md                        # 可选：脑暴、意图假设、对话留痕
│   ├── decisions.md                    # 可选：待决策 + 已决策
│   ├── *-explainer.md                  # 可选：复杂背景说明
│   ├── *.csv / *.json                  # 可选：支撑数据
│   └── *.png / *.svg                   # 可选：图表或说明资产
└── archive/
    ├── retained-completed/             # 已完成但保留溯源
    └── cleanup-candidate/              # 待确认后可清理
```

命名约束:

- 工作流文件夹用纯语义名，不加时间戳
- 每个工作流必须有 `README.md`
- 简单工作流可以只有一个 `README.md`
- `decisions.md` 与 `draft.md` 都是可选的，按复杂度启用

#### 8.3.3 Dashboard

`DASHBOARD.md` 是人类和 AI 打开 workspace 的第一个入口，目标是 **10 秒内掌握全局并知道下一步**。推荐固定顺序:

1. `当前状态`：一句话概括全局状态，使用加粗关键词开头
2. `需要你确认的`：跨工作流汇总待用户回答的问题；没有时明确写"当前无待确认项"
3. `AI 待办`：列出 AI 可以推进的任务、优先级、状态、阻塞说明
4. `活跃工作流`：一行一个工作流，附阶段、健康度、简述
5. `已归档`：折叠列出已完成工作流

Dashboard 规则:

- 健康度只用三个状态: `●` 就绪 / `⚠` 有阻塞 / `○` 等待输入
- 一行一个工作流，不展开细节
- 只展示提炼后的确认项与推进状态，不直接贴原始脑暴
- 工作流归档时，Dashboard 链接必须同步改到 `archive/**`

#### 8.3.4 工作流 README

工作流 `README.md` 是单个 workflow 的入口页，通常包含:

- 关联需求 / 关联任务
- 阶段 / 创建时间 / 最后更新时间
- `当前状况`
- `待决策项`
- `草稿入口`（如果存在 `draft.md`）
- `背景与上下文`
- `关键里程碑`
- `本文件夹资产索引`

它强调"工作交代"而不是执行元数据。即使工作流已完成，也应直接写"当前无待决策项"，而不是为了套模板强造新问题。

#### 8.3.5 Draft 草稿层

`draft.md` 用于记录尚未定稿、但值得保留的探索内容:

- 用户真实意图的假设与收敛过程
- AI 给出的备选方向和粗粒度建议
- 对话留痕的摘要，而不是原始聊天全文
- 后续接手人需要的背景线索

最重要的边界:

- `draft.md` 服务于继续讨论，不承担 requirement 的确认职责
- 尚未提炼的内容留在 `draft.md`
- 需要发给用户确认的问题，提炼到 requirement 的 `待确认`
- `draft.md` 可以链接 requirement，但不是 requirement 的替代品

#### 8.3.6 决策日志

`decisions.md` 记录待决策项与已决策项，但要保持简洁、结论化。复杂的背景、概念解释或长篇 trade-off 放到 `*-explainer.md`，由 `decisions.md` 链接引用。

待决策项通常包含:

- 提出时间
- 影响范围
- 紧急度
- 1-2 句话背景
- 选项表格（选项 / 描述 / 代价 / 风险）
- 支撑数据链接

已决策项通常包含:

- 决策时间
- 结论
- 理由
- 落地位置（task / 代码 / 资产）

#### 8.3.7 核心职责

1. **待确认看板**: 聚合用户需要回答的问题
2. **AI 待办看板**: 汇总 AI 可以推进的任务和阻塞情况
3. **进展叙事**: 用人话解释当前到哪了
4. **选项 + Trade-off**: 为决策提供可比选项
5. **决策日志**: 沉淀已做出的选择和理由
6. **Draft 持久化**: 保留探索期草稿和意图挖掘过程
7. **意图挖掘**: 帮助把模糊需求整理成可确认问题
8. **干预判断**: 明确当前是否需要人类介入

#### 8.3.8 维护职责

- **写入权：Parent orchestrator 独占**
- 子智能体通过 handoff 的 `decision_candidates` 等字段供料
- 需要人类决策的事项写入 `decisions.md`
- 值得持久化但尚未定稿的探索内容写入 `draft.md`
- 只是执行细节、验证结果、review 结论，仍留在 task doc
- 每次状态变化后同步更新 `DASHBOARD.md`
- 归档时同时移动工作流目录、更新 Dashboard 链接、改写 README 阶段，三者必须一致

#### 8.3.9 与其他层的关系

Workspace 引用 requirement doc 和 task doc，但不重复它们的职责:

- Requirement 负责正式需求真源和确认状态
- Task 负责执行 brief、验证、review、恢复点
- Workspace 负责全局入口、工作交代、探索草稿、决策支撑和归档溯源

换句话说，Workspace 的独特价值在于:

- 让人类快速看懂"现在发生了什么"
- 让 AI 快速恢复"下一步该做什么"
- 给尚未定稿但有价值的探索内容一个稳定归宿

## 9. 项目文件结构映射

```text
project/
├── .cursor/
│   ├── rules/*.mdc                    # L4 冻结规则
│   └── skills/*/SKILL.md              # L3 结构化技能
├── docs/
│   ├── architecture/                  # 架构文档（模块边界、业务流程）
│   ├── dependencies/                  # 外部库参考资料（Context7 刷新）
│   ├── playbooks/                     # L2 领域经验 + 自动化脚本
│   │   ├── migration/playbook.md
│   │   ├── orchestration/playbook.md
│   │   └── {domain}/playbook.md
│   ├── workspace/                     # 决策与 Draft 工作区
│   │   ├── README.md                  # Workspace 机制说明
│   │   ├── DASHBOARD.md               # 全局入口：待确认 + AI 待办 + 工作流列表
│   │   ├── {workflow}/                # 按工作流划分
│   │       ├── README.md              # 工作流入口与当前状况
│   │       ├── draft.md               # 可选：探索草稿 / 对话留痕
│   │       ├── decisions.md           # 可选：待决策与已决策
│   │       ├── *-explainer.md         # 可选：复杂背景说明
│   │       └── *.csv|png|svg          # 辅助资产
│   │   └── archive/                   # 归档工作流
│   │       ├── retained-completed/
│   │       └── cleanup-candidate/
│   ├── requirements/                  # 需求文档（人机交互层）
│   ├── tasks/                         # L1 任务执行简报
│   └── fix-checklists/                # 审查修复清单
├── scripts/                           # 辅助脚本工具
└── test/                              # 测试套件
```

## 10. 自我优化能力

这套架构的核心竞争力在于**可自我优化**：

1. **经验自动沉淀**：每次任务完成后 retrospect，不依赖人类主动总结
2. **知识逐级提升**：从观察 → 验证 → 脚本 → 技能 → 规则，自然演进
3. **工作流持续改进**：编排规则本身也是可迭代的，orchestration playbook 记录编排层面的经验
4. **参考资料自维护**：dependency docs 有明确的刷新触发条件和工作流
5. **避免重复犯错**：playbook 让同类错误不会在不同聊天会话中反复出现
