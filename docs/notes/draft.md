# 要构建什么？

1. role
2. workflow
3. docs spec

```md
1. prd
2. architecture
3. tasks
4. workspace
5. review
6. test
7. ship
8. operate
9. references
```

【想清楚】
01-prd (业务要什么)
02-architecture (技术怎么搭)
【干起来】
03-tasks (谁?什么时候?做什么?)
04-workspace (ideas/草稿)
【查质量】
05-review (审查代码)
06-test (跑程序)
【交差与收尾】
07-ship (发车上线！)
08-operate (线上监控、修Bug、写复盘)
【知识库】
09-references (调查的资料、沉淀下来的经验)

```shell
1. prd

- 00-Main-PRD.md
- 10-Requirements-Checklist.md
- modules/
  - xxx.md

1. architecture

- 00-System-Architecture.md
- adr/                 # 架构决策记录
- database/            # 数据库设计
- api/                 # 接口契约
- designes/
  - TechSpec-01.UserAuth.md #每个模块的设计

1. tasks
2. workspace
3. review
4. test
5. ship
6. operate
7. references
```
