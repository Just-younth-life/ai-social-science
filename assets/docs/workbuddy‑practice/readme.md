# WorkBuddy 自定义专家实践沉淀
> 项目载体：社区科普体系建设项目
> 设计目标：**快‑准‑深**；按任务难度自适应选择思维范式，最小化API调用，避免无意义模型轮次消耗。

## 核心设计
1. 基础范式：本体论 × U型思考 × 乾坤架构
2. 扩展范式：第一性原理、系统思维冰山模型、二阶思维、斯坦福设计思维、MECE+苏格拉底诘问、假设‑验证
3. 自适应难度分级
- **L1 轻量任务**：日志、简短清单，仅本体论+MECE，极速输出
- **L2 中等常规任务**：完整纪要、单活动方案，中等范式组合
- **L3 重度共创任务**：0‑1完整方案，启用全套思维范式

## 文件索引
- [expert‑prompt‑full.md](./expert‑prompt‑full.md)：完整专家System Prompt
- [thinking‑framework.md](./thinking‑framework.md)：思维范式与难度调度规则
- [test‑cases.md](./test‑cases.md)：测试指令与回归用例
- [skill‑git‑import.md](./skill‑git‑import.md)：外部Skill仓库、启用策略
- [notes.md](./notes.md)：实践随笔、踩坑、迭代思考

## 使用原则
1. 日常绝大多数任务，仅依靠自定义专家prompt，**不挂载Skill，减少API消耗**
2. 仅L3重度方案定稿评审阶段，导入Skill做二次校验
3. 修改Prompt，同步更新文档，git留存版本历史
