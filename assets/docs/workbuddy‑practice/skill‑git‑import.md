# WorkBuddy外部Skill Git导入清单 & 使用策略
> 原则：日常业务不挂载Skill，避免额外API调用；仅L3重度定稿评审启用。

## Skill列表
1. nuwa‑skill
仓库地址：`github.com/alchaincyf/nuwa-skill`
能力：复杂体系本体建模、系统论校验；用于顶层方案架构检查。

2. complex‑problem‑solver
来源：SkillHub
能力：第一性原理、5Why、MECE、根因分析、风险识别；排查逻辑漏洞、AI幻觉。

3. awesome‑openclaw‑skills（总索引仓库）
仓库地址：`github.com/VoltAgent/awesome-openclaw-skills`
用途：查找更多thinking/methodology类技能。

## 调用约束
1. L1/L2任务：**禁止加载任何Skill**，仅依赖专家System Prompt，保证速度，降低token消耗。
2. L3重大方案评审阶段：导入上面2个skill做二次校验。
3. 不一次性挂载大量skill，会增加轮次与API开销。
