# 后续想法备忘：skill 引用交互显式化

> 设计阶段识别但此时不做的事项，以及未来可能演进方向。只记录想法，不做任何设计预留——需要时直接实现。

## 想法列表

- **L01**：目标工作区持久记忆列表。
  - 现状：面板目标工作区为「默认当前会话 cwd + 临时 pickDirectory/手填切换」，不持久化最近使用。
  - 何时做：出现频繁在固定几个工作区间切换管理对象的真实使用需求。
  - 备注：届时在 controller/panel 增加最近目标路径列表，纯 client 侧状态，不影响 wire。
- **L02**：单 skill 粒度引用 / 白名单。
  - 现状：延续既有目录级引用，inspect 逐源 catalog 是目录维度，不拆分到单 skill。
  - 何时做：出现「只想引用源目录里部分 skill」的需求时（与既有 reference 的 L03 同源）。
  - 备注：届时声明条目加可选 `skills` 白名单，reference-provider 与 source-inspection 的逐源 catalog 加过滤。
- **L03**：全景多工作区关系视图。
  - 现状：本轮为单工作区聚焦视角（D-14 确认）。
  - 何时做：出现需要总览「哪些工作区互相引用」的关系图需求。
  - 备注：届时在 inspect 之上扩展「扫描磁盘带声明的工作区并聚合」，属独立 UI + 新的聚合 RPC。
- **L04**：健康度原因的显式化（源为空/路径失效/解析失败细分）。
  - 现状：本轮 inspect 返回 entries 带 healthy/empty/invalid 三态，但未细分根因。
  - 何时做：用户反馈「仅看到未生效、不知道为何」时。
  - 备注：届时 inspect 的 entries 增 reason 字段（ENOENT/empty/parse error），面板展示成因。
- **L05**：逐源 diff / 变化高亮（源更新后提示变更了哪些 skill）。
  - 现状：本轮只标注来源与健康度，不做源内容 diff。
  - 何时做：出现「源改了想立刻知道改了什么」时（对应既有 reference L04 的 diff 想法）。
  - 备注：届时在 inspect 或新增 diff RPC 对比源目录 skill 元数据快照。

## 与当前设计的关系（轻量提示）

- L01 纯 client 状态，不触 wire，届时 controller/panel 自实现。
- L02/L04/L05 都只需扩展 `source-inspection`/`inspect` 的返回字段或逐源 catalog 过滤，不改变现有 list/inspect 的结构；当前不预留字段，届时直接加。
- L03 是独立聚合 RPC + 新 UI，不重叠当前单工作区 inspect。
