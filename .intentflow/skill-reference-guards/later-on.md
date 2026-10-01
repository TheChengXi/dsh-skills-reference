# 后续想法备忘：skill-reference-guards

> 设计阶段识别但**此时不做**的事项，以及未来可能的演进方向。只记录想法，不做任何设计预留——需要时直接实现。

## 想法列表

- **L01**：`list` 传递官方 `Observation.complete`
  - 现状：`reference-provider.ts:102` 把 observation 降级为候选数组并丢弃 `complete`，源目录扫描未完成时半截结果会被当作完整结果返回。修法直接（任一源 incomplete → 整体 `complete: false`），但会改变「catalog 不被缓存」的既有行为，需一并评估影响面。
  - 何时做：出现「扫描未完成时目录被误判为空/缺失」的实测复现，或需要评估该行为变更的影响面时。

- **L02**：cwd 规范化与官方 `findProjectRoot` 统一
  - 现状：读声明用 `resolve(cwd)`（`references-store.ts:25`），官方 project 根用沿 `.git` 向上的 `findProjectRoot`；路径别名/大小写可能判定不一致。
  - 何时做：出现「已删除声明却仍被读到」的实测复现。

- **L03**：权限类判定前置（不可读/不可写探测）
  - 现状：本轮只判定「存在且为目录」，不探测权限；目标目录存在但无写权限时，由既有 `replace` 的写入失败通道呈现 `写入声明失败: …`。
  - 何时做：出现「路径存在但无权限」导致静默失败或误报的实测复现。

- **L04**：目标工作区输入增强
  - 现状：单一输入框 + 选择目录按钮，逐字符即时载入。
  - 何时做：反复在几个工作区间切换的真实反馈出现时——常驻框内前缀、手填历史候选下拉、持久记忆列表。

- **L05**：目录选择失败可见提示
  - 现状：`pickTargetPath`/`pickEntryPath` 不捕获 `pickDirectory()` 异常，失败与「点了没反应」无法区分。
  - 何时做：host 选择器报错实际干扰使用。

- **L06**：browse 后端下的选目录
  - 现状：`uiWorkspace.pickDirectory` 依赖 host 侧 pick；browse 后端只有 `list`/`createDirectory`，没有 `pick`。
  - 何时做：从其它机器访问 GUI，或部署到 Linux。

- **L07**：入口按钮 hero 态常驻 + 引用源健康角标
  - 现状：入口挂 `conversation.input.left`，仅选中会话时可及，新会话首屏看不到入口（属 DSH 工具行 slot 的既定语义）。
  - 何时做：需要在新会话首屏直达面板，或需要在入口处暴露引用源健康度时。

- **L08**：入口按钮图标化与真实伪类
  - 现状：hover 底色由组件内 state 驱动，键盘焦点走浏览器默认 focus ring。
  - 何时做：与官方工具行其它控件做视觉对齐时。

- **L09**：面板结构拆分
  - 现状：`panel.tsx` 521 行，含卡片与开关组件、内联样式常量。
  - 何时做：`panel.tsx` 超约 600 行时——拆 `src/client/skill-card.tsx`、内联样式迁 CSS Module。

- **L10**：预览区按来源分组渲染
  - 现状：预览为单一平铺列表，逐卡片带来源标签。
  - 何时做：源数量变多、需要按源成组扫一遍时。

- **L11**：预览即时性——编辑态增删条目后刷新预览
  - 现状：开关与置灰已即时（`controller.isSkillEnabled` 由编辑态白名单派生），缺的是列表本身随编辑态 entries 变化。
  - 何时做：需要「按编辑态 entries 预演」时——需给 `inspect` 增加预演入参（wire 变更）。

- **L12**：健康度根因细分与逐源清单
  - 现状：健康度只有 `ok/empty/invalid` 三态，无失败根因字段；无逐源原始清单与源间 diff。
  - 何时做：三态不足以定位问题（如需要区分 ENOENT / 空目录 / 解析失败）时。

- **L13**：agents 文件引用与多根声明
  - 现状：声明固定为「工作区根 → `.dsh/skills`」单根。官方 `dsh-skill-filesystem` 已原生扫描 `.agents/skills`。
  - 何时做：需要覆盖 `.agents/skills`、agent presets、AGENTS.md 时——把声明泛化为多根。

- **L14**：本地 skill 停用
  - 现状：白名单只存在于引用声明条目，本地 skill 无承载位置。
  - 何时做：需要停用本地 skill 时（需先解决白名单的承载位置）。

- **L15**：声明条目 `skills` 字段的直接查看与编辑
  - 现状：只能经预览区启停开关间接产生白名单，手写进声明文件的 `skills` 在面板里不可见。
  - 何时做：出现手工编辑白名单的真实使用后。

- **L16**：全景多工作区关系视图
  - 现状：面板一次只面对一个目标工作区。
  - 何时做：需要纵览多个工作区之间的引用关系时。

- **L17**：本地特化/派生 + 上游同步
  - 现状：与「纯跟随」语义冲突，是独立的大需求。
  - 何时做：出现「引用源的 skill 需要按目标工作区特化」的真实需求时。

- **L18**：整源启停开关
  - 现状：与「删除该声明条目」等价，故未提供。
  - 何时做：需要临时停用而非删除声明条目时。

- **L19**：`inspect` 的可用性判定统一
  - 现状：`list` 对不可用路径回传 `unavailable`，`inspect` 维持空结果（见 design D11——面板已不调用，属确定不发生的分支）。
  - 何时做：出现 `inspect` 的其它调用方时。

- **L20**：client 与 contract 的 wire 类型单一来源
  - 现状：`client/controller.ts` 自行声明 `ReferenceEntryWire`/`InspectSkillWire` 等 wire 类型，与 `contract.ts` 的 zod schema 重复；本次为 `unavailable` 需同步改三处。
  - 何时做：下一次 wire 变更时——改为从 contract 派生类型（client 半已在 bundle 内引入 zod，无体积代价）。

- **L21**：面板渲染的自动化测试环境
  - 现状：项目无 jsdom / React 测试库，`panel.tsx` 的渲染分支只能肉眼验证（含本次新增的不可用态分支）。
  - 何时做：面板分支数量继续增长、肉眼回归成本超过引入测试库成本时。

- **L22**：`writeReferences` 的判定下沉
  - 现状：可用性判定在 `rpc` 编排层（见 design D1），`writeReferences` 的 `mkdir` 保持无条件——因为 `<target>/.dsh` 不存在而工作区存在是合法空态。
  - 何时做：出现 `writeReferences` 的其它调用方时，需重新评估把判定下沉到 IO 层。

- **L23**：类型检查的增量/缓存优化
  - 现状：`npm run build` 全量检查宿主 + client 两半，当前规模耗时可接受。
  - 何时做：client 半规模增大导致构建明显变慢时。

## 与当前设计的关系

以上想法可能触及本次设计引入的接口与结构，但当前不做任何预留，届时直接改：

- **L01、L11** 会再次改动 wire——与本次新增的 `unavailable` 字段同处 `skillReferenceResultSchema`（D2），届时一并评估该 schema 的形状。
- **L19、L22** 直接关系 D1 的分层取舍：前者让 `inspect` 复用 `fs-directory`，后者可能把判定从 `rpc` 下沉到 `references-store`。
- **L03** 是 D1 判定口径的扩展方向（从「存在且为目录」扩到「可写」）。
- **L09、L21** 会重排 D4 拆出的面板结构，并把 D3/D4 的渲染分支纳入自动化。
- **L20** 会消除 D2 中「wire 形状三处同步修改」的重复声明风险。
- **L13** 会把 D1 所在的单根声明模型泛化为多根，影响 `schema`/`references-store`/`reference-provider`/`source-inspection` 全链。
