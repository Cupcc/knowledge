---
title: AI Coding Agent 编排架构
description: 从角色体系、知识管理到编排工作流，系统梳理 AI Coding Agent 的协作设计。
---

# AI Coding Agent 编排架构设计

基于 Cursor IDE + Claude/GPT 的多智能体编排架构实践笔记。本文参考 `saifute-wms-server-nestjs-fix` 这个真实 NestJS WMS 迁移仓库，记录一套在复杂业务代码库里逐步演进出的 Agent 协作体系：从角色划分、知识管理到工作流编排的完整设计思路。

> 当前状态：已完成详细版  
> 阅读建议：建议先读完 [大模型基础认知](/basics/llm-overview) 和 [Prompt Engineering 入门](/basics/prompt-engineering)，再阅读本文。

## 先看结论

如果把大模型看成能力底座，那么 Agent 更像是在这个底座上叠加“任务拆解、工具调用、状态管理、验证与协作机制”的系统层。本文的重点，不是单个 Prompt，而是如何把多个角色、文档、验证步骤和经验沉淀组织成一个可持续迭代的工作流。

参考项目的业务复杂度很高：同一个仓库同时承载 NestJS 后端、Vue 管理端、Prisma schema、历史数据迁移脚本、库存价格层重建、月度报表、RBAC、系统配置和验收文档。这类项目最容易暴露 Agent 协作的真实问题：一次改动常常跨前后端、数据库、报表导出和测试；一次恢复任务如果读错旧文档，就可能继续执行已经归档的范围；一次数据库脚本如果没有明确护栏，就可能把“开发便利命令”变成破坏性操作。

因此，这套架构的核心不是“让 AI 多开几个角色”，而是三件事：

1. **事实优先**：每次先读当前代码、索引和运行配置，而不是从聊天记忆或旧文档继续。
2. **分层留痕**：长期业务真源、活跃任务状态、临时探索草稿、稳定规则分别存放。
3. **验证闭环**：代码修改必须落到类型检查、测试、构建、API 检查、数据库校验或浏览器验收等可复现证据上。

## 1. 设计哲学

| 原则         | 说明                                                           |
| ------------ | -------------------------------------------------------------- |
| 简洁优雅     | 用最小开销解决问题，节省 token 消耗                            |
| 自主决策     | 尽量自主推进，只在重大决策点（架构变更、数据库表变更）停下确认 |
| 渐进式披露   | 不一次性加载全部上下文，按需读取最小相关文件                   |
| 依靠工具     | 用工具验证事实，不靠主观判断和记忆                             |
| 基于文件系统 | 所有状态、通信、经验都持久化到文件，不依赖聊天记忆             |

## 2. 角色体系

### 2.1 Main Agent（编排者）

编排者是整个工作流的中枢。它不直接写大量代码，而是负责：

- **分流决策**：判断任务走轻量直接通道还是重型编排流程
- **子智能体调度**：按当前事实选择 `plan`、`code`、`review`、`acceptance` 或直接续接已有 task，而不是机械套固定流程
- **通信枢纽**：接收子智能体的 handoff 报告，做合并和冲突判断
- **质量关卡**：验证与审查闭环满足门禁后，由编排者执行提交；重大范围与契约变更仍以用户明确确认为准
- **经验沉淀**：在 retrospect 阶段回顾全流程，写入 playbook
- **提交归属**：**只有编排者创建提交**；Planner / Coder / Reviewer / Acceptance QA 不代替落账。默认交付形态是「验证通过后由编排者管理提交」

编排者的关键行为准则：

- 执行系统性任务时根据风险选择轻量验证、完整验收或人工确认
- 做重大决策时停止等待用户确认（架构变更、数据库表变更）
- 不盲目相信文档——出现困惑或冲突时调用工具、执行测试验证
- **默认单写者**：一轮通常只派一个 coder 动代码与共享库；并行需可写路径事先互斥、共享产物有唯一 Owner，并对并发子智能体总数设上限，降低合并冲突
- 纯摸底仓库时，单开**只读/探索**子任务，与写路径隔离
- 子智能体之间依靠文件系统通信，不依赖聊天记忆传递

### 2.2 Planner（规划者）

规划者在动手之前做调研和拆解：

- 调查 API 和最佳实践，确保不使用废弃 API，不用不符合当前版本的写法
- 撰写参考资料（`docs/dependencies/`）供 coder 查阅，避免每次都重新调查
- 将项目计划写入 `docs/tasks/*.md`，作为 coder 的执行简报
- 输出：任务目标、影响文件、实施步骤、风险点、验证命令、并行安全性判断
- 写入边界：规划阶段以任务文档为落点；不借规划之名改动应用代码或放宽冻结边界，除非编排者显式扩大授权

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

### 2.5 Acceptance QA（验收者）

Acceptance QA 不是代码审查者的别名，而是需求级验收者。它关注的是“用户要的能力是否真的交付”，而不是单个实现文件是否写得合理。

- 依据 requirement 的验收标准、task doc 的 acceptance mode 和用户可见流程设计验收路径
- 在 `Acceptance mode = full` 时维护或更新 `docs/acceptance-tests/**`，形成可复用验收规格、案例和运行记录
- 需要时执行浏览器验收、API 验收、数据库核验或业务证据采集
- 将验收结论回写到 task doc，并在能力完成时同步更新对应 `docs/requirements/domain/*.md` 状态
- 遇到环境缺口、证据缺口、需求误解或实现缺口时，明确分类并交还给 Main Agent 分派修复

参考 WMS 仓库中，Acceptance QA 常用于月度报表、销售项目、库存价格层、主数据等跨页面 / 跨模块能力。代码审查通过只说明实现没有明显问题；QA 通过才说明这一轮业务能力具备可签收证据。

### 2.6 模型选择策略

不同角色对模型能力的要求不同，应自动路由或手动选择以节省 token：

| 角色     | 推荐模型等级 | 原因                                         |
| -------- | ------------ | -------------------------------------------- |
| 项目规划 | xhigh        | 需要深度推理、跨模块分析、风险预判           |
| 代码执行 | high         | 需要准确实现，但范围已被规划约束             |
| 代码审查 | xhigh        | 需要独立判断正确性、发现隐含风险             |
| 验收 QA  | xhigh        | 需要从用户流程、数据证据和需求口径判断完成度 |
| 轻量任务 | fast         | 简单编辑、格式修复、文档调整                 |

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
       → 恢复事实 → 规划或续接 → 实施 → 审查 / 验收 → 收口
```

轻量通道的判断信号：

- 单文件或极小路径集
- 无跨模块设计选择
- 不涉及迁移、回填、对账语义
- 不触碰共享合约或冻结边界
- 无需 task doc 来安全恢复

轻量通道下的**刻意降载**（避免「为小活套大流程」）：

- **默认不**仅为流程完整而新建 requirement / task 文档；只有续接风险、审计需要或范围会跨多轮对话时才落地文档
- **不要**仅为对称而启动 Planner；需求已清、改动能一口咬定时，由编排者直接改并做窄验证即可
- 低风险变更（文档措辞、注释、单一配置项、明显无行为风险的格式修复等）：编排者自检 + 针对性 lint/test 通常足够；**不必**次次单独起 Reviewer，除非暴露隐藏风险或用户要求审查

### 3.2 重型编排流程

```text
1. restore     读取 REQUIREMENT_CENTER / TASK_CENTER / workspace / 当前代码
                  ↓
2. decide      判断是直接续接、补规划、进入编码、先审查，还是先验收
                  ↓
3. execute     Planner / Coder / Reviewer / Acceptance QA 按需参与
                  ↓
4. fix loop    如有 blocking / important 发现 → 修复 → 复核
                  ↓
5. closeout    更新 task / requirement / workspace，必要时归档
                  ↓
6. retrospect  非轻量任务完成后沉淀经验到 playbook 或 rules
```

review → fix 是一个修复循环，不是停止点。只有 reviewer 报告 blocking / important 已清零，才进入验收或收口；仅 plan、仅 review 这类收窄交付通常不产生提交。

在参考仓库里，重型流程后来从“固定的 `plan → code → review → acceptance`”收敛成“事实驱动的自适应流程”。例如用户说“继续”时，Main Agent 先看 `docs/tasks/TASK_CENTER.md` 里是否已有 active task，再决定从哪一步恢复；如果 active task 已经有清晰 coder handoff，就不重新创建 plan。如果用户只要求排查一个低风险问题，则可以直接读源码、跑聚焦命令、给出结论，不为了形式创建任务文档。

Acceptance QA 只在验收证据有价值时介入：用户明确要求完整测试报告、task 选择 `Acceptance mode = full`、涉及真实用户流程、跨模块业务闭环或高成本业务影响时，应进入 QA；文案微调、单文件低风险修复或纯内部重构，通常由 Reviewer + 聚焦验证即可收口。

### 3.2.1 提交流程与约定

具体条款放在仓库的 commit 规则里（如 `.cursor/rules`）；本文只记原则，与 §4.4 一类章节同级精简。

- **归属**：仅编排者创建提交，子智能体不落账。
- **时机**：验证与审查门禁满足后再终稿入库；用户声明 `no-commit` 则跳过所有提交，**不**缩小本轮交付范围。
- **信息形态**：终稿用 Conventional Commits（`type(scope): subject`，subject 写意图）；工作分支可少量检查点承载已验证进度，主线不堆检查点，合入前一般 squash 成干净终稿。
- **常见情形**：`plan-only` / `review-only` 多止于无提交；交付物就是文档时仍可终稿入库。环境禁止自动提交时，交付 **commit-ready handoff**。

### 3.3 需求与 Workspace 驱动

非轻量任务仍遵循需求先行；`workspace` 作为正式的「工作交代区 + 探索草稿区」，既服务人类决策，也作为 AI 恢复上下文和判断下一步的入口。

#### 3.3.1 需求分层与索引（先看目录，再找文件）

需求侧建议采用**分层真源 + 索引看板**，避免所有文档扁平混用。参考仓库最终采用的是“项目真源 + 领域真源 + 任务索引”，`req-*` 只作为可选切片，而不是默认中间层：

| 层级       | 典型路径 / 约定                                     | 用途                                                        |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 项目级     | `docs/requirements/PROJECT_REQUIREMENTS.md`         | 长期项目目标、全局业务边界、跨领域共同规则                  |
| 领域级     | `docs/requirements/domain/*.md`                     | 按业务域 / 能力线维护长期真源，如库存、入库、销售、月报等   |
| 任务切片   | `docs/requirements/req-*.md`（可选）                | 只在单次交付需要独立确认、跨领域临时收敛时使用              |
| 需求索引   | `docs/requirements/REQUIREMENT_CENTER.md`           | 需求条目、状态、关联任务和统计的一览                        |
| 任务索引   | `docs/tasks/TASK_CENTER.md`                         | 哪些 task 仍 active、哪些已归档、哪些只是 cleanup-candidate |
| 工作区入口 | `docs/workspace/DASHBOARD.md`（需要决策支持时使用） | 当前故事线、待确认项、AI 下一步，不替代 requirement / task  |

续接会话、判断「还有没有活在跑」时，应**优先**以索引与 lifecycle（active / 归档位置）为准，再打开具体长文。

#### 3.3.2 协作数据流

```text
docs/requirements/REQUIREMENT_CENTER.md
docs/tasks/TASK_CENTER.md                生命周期与活跃 scope 真源（先看）
         ↓
docs/requirements/{PROJECT | domain | req-*}.md   分层需求正文
         ↓
docs/workspace/DASHBOARD.md              全局入口（当前状态 + 待确认 + AI 待办）
         ↓
docs/workspace/<workflow>/               工作流区（README + draft + decisions）
         ↓
docs/tasks/task-*.md                     任务执行简报（规划输出、验证、review）
         ↓
代码实施 + 验证
         ↓
同步进展 → requirement 当前进展 / 待确认；Workspace Dashboard、README、draft、decisions；task 状态
```

Requirement 文档建议结构（与 handoff 对齐）：

- `**用户需求**`：本次要做什么（简洁、可验收）
- `**当前进展**`：面向读者的状态块，至少包含 `**阶段进度` / `当前状态` / `阻塞项` / `下一步**`
- `**待确认**`：尚未定稿、需用户拍板的事项；没有则写 `None`
- **Metadata（推荐）**：`Status`（如 `needs-confirmation` / `confirmed`）、`Lifecycle disposition`（`active` 与归档桶）等，便于索引与自动化

Workspace、task 分工不变：`draft.md` 不是确认真源；执行细节与 review 结论留在 task doc。

一个重要实践是：**不要让任务文档替代需求文档，也不要让 workspace 替代任务文档**。参考仓库的 `TASK_CENTER.md` 会记录“当前活跃任务”和“已归档任务”，但长期业务口径仍回写到 `docs/requirements/domain/*.md`。这样下一次继续月度报表、库存价格层或系统管理能力时，Agent 不需要从几十个历史 task 里猜测当前真源。

#### 3.3.3 闭环与归档

当某一 scope **客观上已结束**且无真实后续跟进的默认动作时：

- **同一轮对话内**将 requirement / task / workspace 迁至归档桶或更新 lifecycle，并刷新两侧索引；避免根目录长期悬挂「假活跃」条目，误导后续「继续」从错误文档续接
- 已归档文档仅作**溯源 / provenance**，不自动当作下一轮的活跃 handoff，除非用户明确重开 scope

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

此外还有若干**正交层**，不属于知识成熟度阶梯，但在编排中不可或缺：

```text
docs/workspace/**                    决策与 Draft 工作区（人类决策支持 + AI 恢复上下文）
docs/requirements/**                 用户交互层（分层：PROJECT / domain / 可选 req-* 切片）
docs/requirements/REQUIREMENT_CENTER.md   需求索引看板（活跃 / 归档 / 与 task 对应）
docs/tasks/TASK_CENTER.md                 任务索引看板（活跃 / 归档桶 / 清理候选）
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

| 层级    | 写入条件                         | 不应写入                            |
| ------- | -------------------------------- | ----------------------------------- |
| L4 规则 | 已确认、跨任务稳定、不含 secrets | 临时阻塞、一次性修复、分支状态      |
| L3 技能 | 流程稳定、可重复执行             | 还在迭代的实验性方法                |
| L2 经验 | 非显而易见的模式、教训、边界案例 | 众所周知的库行为（放 dependencies） |
| L1 任务 | 当前任务的运行时状态             | 跨任务复用的知识                    |

### 4.4 Rules 的使用原则

- 将硬性的、长期的约束写入 rules（如环境信息、冻结的业务规则）
- 将每次都需要查看的信息写入 rules（如开发环境版本）
- rules 信息尽量简洁，避免膨胀
- 不写入临时状态、一次性修复、分支特定的 workaround
- 对危险操作写明确护栏，而不是只写提醒。例如参考仓库曾把 Prisma 推库 / 数据库重建规则放进 `.cursor/rules/prisma-push-collation.mdc`，要求使用受控入口、校验排序规则，并避免把一次性恢复步骤伪装成普通开发命令。

## 5. 记忆与通信系统

### 5.1 设计目标

| 目标                         | 实现方式                                           |
| ---------------------------- | -------------------------------------------------- |
| 子智能体间通信               | 通过 `docs/tasks/*.md` 和 handoff 报告传递         |
| 避免对话中重要信息丢失       | 关键状态写入文件，不依赖聊天记忆                   |
| 避免常用信息反复调用工具获取 | 本地缓存到 `docs/dependencies/`、`docs/playbooks/` |
| 避免 AI 反复犯同一个错误     | 经验沉淀到 playbook，成熟后提升为 rule             |

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

- 执行进展 → 同步到 requirement 的 `**当前进展**`（写入或折叠进 `阶段进度` / `当前状态` / `阻塞项` / `下一步`）
- 需要用户决策的事项 → 写入 `docs/workspace/<workflow>/decisions.md`
- 值得持久化的探索草稿 → 写入 `docs/workspace/<workflow>/draft.md`
- 工作流状态变化 → 更新 `docs/workspace/DASHBOARD.md`
- 对话结束前 → 将续接状态写入 task doc，确保下一个会话能无损恢复

### 5.3 跨会话续接

当用户说「继续」「接着做」「在新会话里续」时，**优先恢复生命周期真源**，再下钻细节：

1. **先看索引与 disposition**：`docs/tasks/TASK_CENTER.md`、`docs/requirements/REQUIREMENT_CENTER.md`（及其中对 `archive/` 路径的说明）；确认是否仍存在 **active** 的 requirement / task，抑或仅有已归档条目。若已仅有归档、且用户未要求重开旧 scope，则把归档当 provenance，不要默认复活上一轮范围。
2. **再看 Workspace 全局入口**：`docs/workspace/DASHBOARD.md`（活跃工作流、待确认、AI 待办）；若相关工作流已归档，按 Dashboard 指向的 `docs/workspace/archive/` 阅读即可，勿与活跃 scope 混读
3. **下钻工作流目录**：`docs/workspace/<workflow>/README.md`，必要时补读 `draft.md`、`decisions.md`
4. **读取活跃 handoff 载体**：关联的 requirement（PROJECT / domain / 可选 `req-*` 中的具体文件）、task doc、`docs/fix-checklists/`、任务中引用的报告与产物路径
5. **重建心智模型**：当前范围、最后一步、已通过验证、剩余阻塞、下一步最小安全动作
6. **不从头重规划**，除非：不存在可读 task、task 与仓库现状矛盾、或用户明确要求重议方案

结束前可在对话内做一次**一致性扫视**：requirement / task / workspace 三者的 lifecycle 是否互相指向；Dashboard 是否仍把已收口工作流标成活跃。

## 6. API 与依赖工作流

### 6.1 四级查找顺序

```text
1. 本地版本确认    package.json + lockfile（bun.lock / pnpm-lock.yaml 等）
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

参考仓库里后端根目录以 Bun 为脚本入口，前端 `web/` 保留 pnpm 约定；因此依赖检查不能只看一个锁文件。类似地，Prisma、NestJS、Swagger、Winston 这类高频依赖会沉淀到 `docs/dependencies/*.md`，但只有 `Refresh status` 显示已验证时，才把本地依赖文档当作 API 依据。

## 7. 工具优先原则

| 场景           | 正确做法                   | 错误做法      |
| -------------- | -------------------------- | ------------- |
| 获取执行时间   | 调用工具 / 编写脚本计时    | 估计          |
| 修复代码格式   | 先跑 formatter 和 linter   | AI 手动修格式 |
| 验证正确性     | 运行 test 脚本             | 只靠主观判断  |
| 确认 API 版本  | 查 package.json + Context7 | 从记忆回忆    |
| 验证文档真实性 | 执行测试、调用工具         | 盲目相信文档  |
| 确认数据库目标 | 读取 `.env.dev` / 连接串   | 猜默认库名    |
| 数据恢复与回放 | 先在 scratch 验证再应用    | 直接改目标库  |

在 WMS 迁移项目里，工具优先尤其体现在数据库和报表上。比如历史数据迁移默认遵循 `dry-run → execute → validate`；库存价格层重建要看 `inventory-replay` 的验证结果；月度报表修改要同时检查后端服务、导出 helper 和 Vue 页面，不能只看页面截图。

## 8. 功能模块总览

### 8.1 核心模块

| 模块                    | 职责                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Orchestration           | 编排智能体协作工作流程，分流决策                                                                  |
| Subagents               | 定义各种 agent 角色和技能                                                                         |
| 通信 (Handoff)          | 基于文件系统的交接通信，确保信息不丢失                                                            |
| Rules                   | 收集环境信息，维护共享的强制性、固定的、长期的规则                                                |
| 参考资料 (Dependencies) | AI 撰写和收集的外部库参考资料                                                                     |
| 需求 (Requirements)     | 人机交互层：分层真源（项目 / 领域 / 可选切片）+ `REQUIREMENT_CENTER` 索引                         |
| 工作区 (Workspace)      | 工作交代区 + 探索草稿区，承载 Dashboard、进展叙事、用户待确认、AI 待办、draft、决策日志与辅助资产 |
| 任务 (Tasks)            | AI 自主规划区域，拆分任务、监控执行、交代结果                                                     |
| 审查 (Fix Checklists)   | 审查结果的持久化记录                                                                              |
| 验收 (Acceptance QA)    | 维护验收规格、运行记录和业务签收证据，判断需求级完成度                                            |
| 经验 (Playbooks)        | 避免反复犯错，常用工作流固化                                                                      |

### 8.2 辅助模块

| 模块    | 职责                                            |
| ------- | ----------------------------------------------- |
| Scripts | AI 利用的各种脚本工具（迁移、验证、报告生成）   |
| Skills  | AI 利用的各种结构化技能（编排、迁移、审查流程） |
| Test    | 审查 AI 工作质量的各种测试                      |
| Hooks   | 监控 AI 进度发送飞书消息、触发代码格式化等      |

### 8.3 工作区（Workspace）

Workspace 是独立于 requirement 和 task 的第三层，定位为"决策与 Draft 工作区"。它既服务人类决策者，也服务 AI 恢复上下文和继续推进工作。核心目标是: **让人类快速理解全局，让 AI 不依赖聊天记忆继续工作。**

在实践中，Workspace 不必为每个任务强制创建。参考仓库会在需求探索、复杂 trade-off、管理层决策报告、报表深访或价格层解释这类场景使用 `docs/workspace/**`；而普通实现任务只需 requirement + task 就能闭环。这个边界可以防止 workspace 变成另一个执行日志堆。

#### 8.3.1 三层定位

| 文档层                        | 回答的问题                                                  | 服务对象                       |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------ |
| `docs/requirements/**` + 索引 | 用户要什么（哪一层真源）+ 当前执行状态 + 还待确认什么       | 意图确认、续接时先看索引       |
| `docs/workspace/**`           | 当前到哪了、要决定什么、有哪些想法仍在草拟、AI 下一步做什么 | **人类决策者 + AI 恢复上下文** |
| `docs/tasks/**` + 索引        | 怎么执行、验证与 review 结论、续接命令与产物路径            | Agent 执行链                   |

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

`DASHBOARD.md` 是人类和 AI 打开 workspace 的**叙事向**总入口，目标是 **10 秒内掌握全局并知道下一步**；与 `REQUIREMENT_CENTER` / `TASK_CENTER` 互为补充（前者偏「有哪些文档仍活跃」，本文件偏「当前故事线与待办」）。推荐固定顺序:

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
saifute-wms-server-nestjs-fix/
├── .cursor/
│   ├── rules/*.mdc                    # L4 冻结规则
│   ├── skills/*/SKILL.md              # L3 结构化技能
│   └── agents/*.md                    # Planner / Coder / Reviewer / QA 等角色说明
├── .agents/                           # 可复用 agent skills
├── .codex/                            # Codex 侧 agent 配置和 hooks
├── docs/
│   ├── architecture/                  # 架构文档（模块边界、业务流程）
│   ├── dependencies/                  # 外部库参考资料（Context7 刷新）
│   ├── acceptance-tests/              # 验收规格、案例与运行报告
│   ├── catalog/                       # 文档检索目录
│   ├── playbooks/                     # L2 领域经验 + 自动化脚本
│   │   ├── migration/playbook.md
│   │   ├── orchestration/playbook.md
│   │   └── {domain}/playbook.md
│   ├── workspace/                     # 决策与 Draft 工作区
│   │   ├── README.md                  # Workspace 机制说明
│   │   ├── DASHBOARD.md               # 全局入口：待确认 + AI 待办 + 工作流列表
│   │   ├── {workflow}/               # 按工作流划分
│   │   │   ├── README.md
│   │   │   ├── draft.md
│   │   │   ├── decisions.md
│   │   │   └── ...
│   │   └── archive/
│   │       ├── retained-completed/
│   │       └── cleanup-candidate/
│   ├── requirements/                  # 人机交互层
│   │   ├── REQUIREMENT_CENTER.md      # 需求索引看板
│   │   ├── PROJECT_REQUIREMENTS.md    # 项目级长期真源
│   │   └── domain/*.md                # 领域级长期真源
│   ├── tasks/
│   │   ├── TASK_CENTER.md             # 任务索引看板
│   │   ├── task-*.md                  # 活跃执行简报
│   │   ├── README.md / _template.md   # 目录说明与模板（可选）
│   │   └── archive/
│   │       ├── retained-completed/
│   │       └── cleanup-candidate/
│   └── fix-checklists/                # 审查修复清单
├── prisma/                            # Prisma schema 与 seed
├── scripts/                           # 辅助脚本工具
├── src/modules/                       # NestJS 业务模块
├── web/                               # Vue 3 前端工程
└── test/                              # 测试套件
```

对应到业务边界，参考仓库的 `src/modules/` 不是随意分目录，而是把关键所有权固定下来：`inventory-core` 是库存写入唯一入口，`approval` 收口审核状态，`rbac` 负责权限树和数据范围，`reporting` 承担跨域报表，`system-management` 承载系统配置和管理能力。Agent 编排文档必须理解这些边界，否则很容易把一次“报表显示调整”扩大成跨域 schema 变更。

## 10. 自我优化能力

这套架构的核心竞争力在于**可自我优化**：

1. **经验自动沉淀**：每次任务完成后 retrospect，不依赖人类主动总结
2. **知识逐级提升**：从观察 → 验证 → 脚本 → 技能 → 规则，自然演进
3. **工作流持续改进**：编排规则本身也是可迭代的，orchestration playbook 记录编排层面的经验
4. **参考资料自维护**：dependency docs 有明确的刷新触发条件和工作流
5. **避免重复犯错**：playbook 让同类错误不会在不同聊天会话中反复出现
