# 后续想法备忘：skill 引用

> 设计阶段识别但此时不做的事项。只记录想法，不做设计预留。

## 想法列表

- **L01**：agents 文件引用（`.agents/skills`、agent presets、AGENTS.md）。
  - 现状：需求明确延后，先只做 skill 引用。
  - 何时做：skill 引用稳定、出现跨工作区复用 agent 配置的真实需求。
  - 备注：官方 `dsh-skill-filesystem` 已原生扫描 `.agents/skills`，扩展时只需把声明条目从「工作区根 → `.dsh/skills`」泛化为「工作区根 → 多根」。
- **L02**：本地特化 / 派生 + 上游同步追踪。
  - 现状：与「引用」（纯跟随）语义冲突，需求阶段明确排除。
  - 何时做：出现某工作区需对同一 skill 做本地差异化且不影响源的明确需求。
  - 备注：届时引入版本基线与冲突裁决（类似 git fork + upstream merge），是独立的大需求。
- **L03**：单个 skill 粒度引用。
  - 现状：目录级引用已覆盖主痛点，逐条挑 skill 未做。
  - 何时做：出现「只引用源目录里部分 skill」的需求。
  - 备注：声明条目加可选 `skills` 白名单，reference-provider 过滤 candidate。
- **L04**：引用源健康度可视化（逐源列出 `.dsh/skills` 原始清单、按来源标注、diff 对比）。
  - 现状：第二轮面板已做「当前工作区已生效 skill 聚合预览」（复用第一方 `skill.list`，混合引用来的 + 本地的）；但「逐源列出源目录原始内容」「标注每个 skill 来自本地还是哪个引用源」仍未做。
  - 何时做：面板上线后据使用反馈决定。
  - 备注：属于增强，需额外 RPC（读各源目录 skill 摘要）或对 `skill.list` 结果补来源标注。

## 与当前设计的关系（轻量提示）

- L01 / L03 只会扩展 schema 与 reference-provider 的根解析/过滤，当前接口无需预留，届时直接加字段与过滤逻辑。
- L02 会整体替换 reference-provider 的「纯跟随」语义，并把「引用 vs 本地优先级」从 `REFERENCE_SKILL_RANK` 常量升级为配置驱动的集中式 rank 计算；当前不做任何版本基线预留，届时独立设计。
- L04 只需在 rpc 追加只读查询方法，不影响现有 list/update。