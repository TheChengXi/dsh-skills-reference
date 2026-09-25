# backlog：待修缺口与演进待办

> 跨 feature 的长期总账，只记两类：**已知要修的问题**、**想做但没做的事**。
> 不记经验教训与流程回顾——每次需求不同，把教训当规范读会变成束缚。
> 模块现状见 `.intentflow/_packages/dsh-skills-reference.yml`；已归档的 feature 文档在 git 历史，最后一个含全部文档的提交是 `78432dd`。

## 一、待修缺口

实现层已知问题，与「新功能」无关。

**1. 目标工作区不存在时静默创建目录**

`writeReferences` 无条件 `mkdir(dirname(filePath), { recursive: true })`（`src/references-store.ts:45`），而面板允许手填任意目标工作区路径 → 手填一个不存在的路径并保存，会在该处创建出目录树与声明文件。interactive 的 design 曾要求「目标工作区不存在/不可读 → 提示不可用、写操作禁用、不误建 `.dsh` 目录」，代码与 `@intent` 均无此校验。

**2. client 半不受类型检查**

`tsconfig.json` 的 `exclude: ["src/client"]` → client 半的类型错误没有自动捕获手段，只靠 esbuild 语法解析与人工 review。需要一份覆盖 `src/client` 的 type-check。

**3. `list` 丢弃官方 `Observation.complete`**

`reference-provider.ts:102` 把 observation 降级为候选数组并丢弃 `complete`；源目录扫描未完成时，半截结果会被当作完整结果返回。修法直接（任一源 incomplete → 整体 `complete: false`），但会改变「catalog 不被缓存」的既有行为，需一并评估影响面。

**4. cwd 规范化与官方不一致**

读声明用 `resolve(cwd)`（`src/references-store.ts:25`），官方 project 根用沿 `.git` 向上的 `findProjectRoot`；路径别名/大小写可能判定不一致。等出现「已删除声明却仍被读到」的实测复现，再做统一核对。

## 二、演进待办

想做但没做。每条给出触发条件——**条件未到就不做**。

### 目标工作区输入

- 常驻框内前缀、手填历史候选下拉、持久记忆列表：三条同源，做时一并设计。触发：反复在几个工作区间切换的真实反馈。

### 目录选择

- **失败可见提示**（最接近「该做」）：`pickTargetPath`/`pickEntryPath` 不捕获 `pickDirectory()` 异常，失败与「点了没反应」无法区分。触发：host 选择器报错实际干扰使用。
- browse 后端下的选目录：该后端只有 `list`/`createDirectory`，没有 `pick`。触发：从其它机器访问 GUI，或部署到 Linux。

### 入口按钮

- hero 态常驻入口（新会话首屏看不到入口，属 DSH 工具行 slot 的既定语义）；入口承载引用源健康角标。
- 图标化、hover/焦点改用真实伪类：属打磨项，无触发条件不做。

### 面板结构

- 拆 `src/client/skill-card.tsx`、内联样式迁 CSS Module：触发 `panel.tsx` 超约 600 行（现 521 行），两条同源。
- 预览区按来源分组渲染：触发源数量变多、用户想按源成组扫一遍。

### 预览即时性

- 编辑态增删声明条目后刷新预览、停用项即时重排：需给 `inspect` 增加「按编辑态 entries 预演」的入参（wire 变更）。现状开关与置灰已即时（`controller.isSkillEnabled`），缺的是列表本身。

### 健康度与来源

- 失败根因字段（ENOENT / 空目录 / 解析失败细分）：现仅 `ok/empty/invalid` 三态。
- 逐源原始清单与源间 diff。

### 引用能力

- agents 文件引用（`.agents/skills`、agent presets、AGENTS.md）：官方 `dsh-skill-filesystem` 已原生扫描 `.agents/skills`，扩展时把声明从「工作区根 → `.dsh/skills`」泛化为多根。
- 本地 skill 停用：白名单只存在于引用声明条目，本地无承载位置。
- 声明条目 `skills` 字段的直接查看与编辑：目前只能经预览区开关间接产生，手写白名单在面板里不可见。
- 全景多工作区关系视图。
- 本地特化/派生 + 上游同步：与「纯跟随」语义冲突，是独立的大需求。
- 整源启停开关：与「删除该声明条目」等价，除非出现新的语义需求。

### 主题

- 错误横幅增强（图标、动画、重试）。
- 自定义主题缺 token 时的 fallback：按 AGENTS「不提前做兜底」，出真实边界再补。

### 监测机制

- 评估独立引入 chokidar（现用原生 `fs.watch`）：触发目标平台出现漏报/不稳定。

## 三、已否决（防重提）

- **按候选 `path` 前缀推断归属**：源目录互为祖孙时会误判；归属是结构事实，已改为逐源内层实例 + owner map。
- **借空数组表达整源停用**：与「`skills` 缺省或空数组 = 全量生效」直接冲突。
- **监测逻辑下沉进 provider**：现有 `deps.watch` 注入式已满足「一次失效链」，演进无收益。
- **client 注入 `<style>` 标签做 hover**：需新增 CSS 投放与清理机制，非验收项；将来要做像素级对齐时再推翻。