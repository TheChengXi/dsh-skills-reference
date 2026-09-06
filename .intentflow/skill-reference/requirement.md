# 需求文档：skill 引用（跨工作区 skill 复用）

## 项目意图
让 skill 开发工作区更新后自动同步到所有引用它的工作区，消除手动复制粘贴——引用方声明来源工作区，一次更新处处复用。
第二轮：把「声明来源工作区」这一步做成图形化操作窗口，用户无需手敲 YAML 即可声明、引用，并即时看到引用结果。

## 功能清单
1. **skill 引用声明**：引用方在工作区本地声明「来源工作区」清单。— ✅ 第一轮已交付
2. **skill 引用注册**：复用官方 `dsh-skill-filesystem` 发现机制，把来源工作区的 skill 注册进当前会话。— ✅ 第一轮已交付
3. **可视化 skill 操作窗口**：侧边栏入口 + 面板，手动完成引用的查看、添加、删除，并预览引用结果（引用来的 + 本地的 skill 清单）。— 🎯 第二轮焦点

## 核心功能

### 核心功能1：skill 引用声明（第一轮已交付）
- **能力**：系统能够 读取 引用方工作区本地 `.dsh/skill-references.yml`，其中每项为「展示名 + 源工作区根路径」。
- **业务价值**：用一份声明文件替代「复制粘贴 skill 目录到每个工作区」。

### 核心功能2：skill 引用注册（第一轮已交付）
- **能力**：系统能够 把声明里的每个源工作区 `.dsh/skills` 目录 注册为 当前会话的 skill 来源，并随源目录变化自动失效重发现（无需复制、无需重启）。
- **业务价值**：源工作区更新 skill 后，所有引用它的工作区在下一轮自动用上最新版本。

### 核心功能3：可视化 skill 操作窗口（第二轮焦点）
- **能力**：系统能够 在 Web 侧边栏提供「skill 引用」入口，打开面板后，对**当前会话工作区**完成引用的查看、添加、删除，并列出该工作区已生效的 skill 清单作为「声明是否生效」的即时验证；所有写操作立即生效，无需重启。
- **业务价值**：不手敲 YAML，图形化管理引用关系；增删后当场看到引用结果，补上第一轮「无法手动声明、无法验证」的闭环缺口。

## 业务规则

### 引用模型
- **场景**：工作区 B 复用开发工作区 A 的 skill。
- **行为**：B 在本地 `.dsh/skill-references.yml` 写「展示名 + A 的工作区根路径」，插件自动取 `<A>/.dsh/skills`。A 无需任何额外动作（skill 就放 A 自己的 `.dsh/skills`）。
- **异常处理**：源路径不存在或不可读 → 该引用源整体跳过并提示，不阻断其他引用源。

### 引用语义（纯跟随）
- **场景**：引用建立后，本地想改动被引用的 skill。
- **行为**：引用是只读跟随——本地不改被引用的 skill，改动回源工作区统一改；本地不做派生态（特化）。
- **异常处理**：无。本地派生态延后，见「边界收束」。

### 同名冲突
- **场景**：引用源里的 skill 名与当前工作区本地 `.dsh/skills` 同名（本地同名视为待淘汰的旧副本）。
- **行为**：引用源优先（开发区的权威版生效）。
- **异常处理**：多个引用源之间同名 → 按声明顺序靠前者优先，具体机制由 design 确定。

### 目录级引用
- **场景**：建立引用。
- **行为**：整个 `<源>/.dsh/skills` 目录作为一体被引用，不支持逐条挑单个 skill。
- **异常处理**：无。

### 声明变更即时生效
- **场景**：新增、删除、修改引用声明（含面板操作与外部手改）。
- **行为**：声明文件变更 → provider 失效并重发现，无需重启；面板的操作写回文件后立即触发同一失效链。
- **异常处理**：声明文件语法错误 → 面板提示解析失败；provider 侧降级为清空引用并 warn（第一轮既定行为），不阻断其他工作区。

### 面板作用域（第二轮新增）
- **场景**：打开面板。
- **行为**：面板锚定**当前会话工作区（cwd）**，只读写该工作区本地的 `.dsh/skill-references.yml`；切换管理对象须在对应工作区打开会话，不支持在面板内跨工作区写别的目录。
- **异常处理**：读不到当前工作区（无有效 cwd 会话）→ 面板显示「无当前工作区」占位，不提供写操作。

### 写路径安全（第二轮新增）
- **场景**：面板写引用声明。
- **行为**：写声明走宿主机自定义 RPC（与 `agentPreset.copy/remove` 同类，属本地敏感操作），**仅接受本机 loopback 请求**；浏览器端不传任意路径——源目录由第一方 `host.pickDirectory` 选定或由用户手填后经宿主机解析。
- **异常处理**：非 loopback 请求一律拒绝。

## 预设测试

### 前置条件
- 工作区 A（开发）：`D:\dev\skill-dev`，含 `.dsh/skills/alpha/SKILL.md`（name: alpha）。
- 工作区 B（引用）：`D:\dev\project-b`，作为当前会话打开，初始无 `.dsh/skill-references.yml`。

### 测试步骤

1. **[发现]**：在 B 打开会话，触发 skill 候选列表。
   **预期结果**：出现来自 A 的 alpha；B 无任何 skill 副本或符号链接。
2. **[实时更新]**：修改 A 的 alpha 正文 → 在 B 再次加载 alpha。
   **预期结果**：加载到 alpha 新正文，无需重启 DSH。
3. **[同名冲突]**：B 本地也放 `.dsh/skills/alpha/SKILL.md`（内容不同）。
   **预期结果**：B 会话加载到的 alpha 是 A 的版本（引用源优先）。
4. **[打开面板]**：在 B 会话侧边栏点「skill 引用」入口。
   **预期结果**：面板打开，显示 B 当前引用声明列表（初始为空或现有条目），并列出 B 已生效的 skill 清单（引用来的 + 本地的）。
5. **[面板添加]**：面板点「添加引用」→ 目录选择器选定 A → 填展示名「skill-dev」→ 保存。
   **预期结果**：`B/.dsh/skill-references.yml` 出现 `{name: skill-dev, path: D:\dev\skill-dev}`；面板预览列表即时出现 alpha，无需重启。
6. **[面板删除]**：面板删除对 A 的引用 → 保存。
   **预期结果**：声明文件对应行被移除；面板预览列表即时消失 alpha；B 会话不再发现 alpha。

### 异常场景

- **[源路径失效]**：A 被删除或改名 → B 继续操作 → alpha 静默消失，面板提示该引用源不可用，其他引用源不受影响。
- **[声明损坏]**：`.dsh/skill-references.yml` 被外部改坏 → 面板打开时提示解析失败（不崩溃、不误写）；provider 侧清空引用并 warn。
- **[无当前工作区]**：无有效会话 cwd 时打开面板 → 面板显示占位提示，写操作禁用。

## 边界收束

**此时必做**：
- 侧边栏入口 + 引用管理面板（client half）。
- 读/增/删引用声明的宿主 RPC（写 `.dsh/skill-references.yml`，loopback-pinned）。
- 引用结果预览（复用第一方 `skill.list`）。
- 写后即时生效（触发 provider 失效）。
- 目录选择（复用第一方 `host.pickDirectory`）。

**此时不做**：
- 源目录内容逐源预览（列出每个源 `.dsh/skills` 里的原始 skill 名）— 属增强（later-on L04），触发条件：面板上线后根据使用反馈决定。
- agents 文件引用（`.agents/skills`、agent presets、AGENTS.md）— 用户明确延后（later-on L01）。
- 单个 skill 粒度引用 — 目录级已覆盖主痛点（later-on L03）。
- 全局声明配置 — 用户否定（本质等于全局 skill，属过度设计）。
- 本地特化 / 派生（派生 + 上游同步追踪）— 与「引用」语义冲突（later-on L02）。

## 实现对齐

现状基线（第一轮已交付，Node host 半，`src/`，已编译安装）：
- `schema.ts`：`ReferenceEntry{name,path}`、`parseReferences`/`serializeReferences`、`resolveSourceDir`（工作区根 → `.dsh/skills`）、`REFERENCE_SKILL_RANK=1`、`REFERENCES_FILENAME`。
- `references-store.ts`：`resolveReferencesFile(cwd)`、`readReferences(cwd)`（缺失→`[]`，非法→抛错）、`writeReferences(cwd, entries)`。
- `reference-provider.ts`：外层 `SkillProvider`（`PROVIDER_NAME="skill-reference"`），按 cwd 缓存内层 `FileSystemSkillProvider`，改写 candidate rank 为 1，`setInvalidate(fn)` / `dispose()`。
- `index.ts`：`inject:['skills']`，`apply(ctx)` 注册 provider、装配 watcher（`fs.watchFile`）。

第二轮新增（Node host 半 + Web client 半）：

- **[可视化窗口 / UI]**：Web client 半插件（`dsh.client` 字段 + `exports["./client"]`），侧边栏入口 + 独立面板；复用官方 `dsh-client-ui-sidebar`/`dsh-client-ui-layout` 接缝挂入口。
- **推导出的约束**：
  - ✅ client 半需产出浏览器 bundle（`window.__ModuleLoader__.load` 形态），并随宿主 client 模块体系加载——本轮新增的构建/装配成本与主要风险点。测试点：面板在 Web 会话可打开。
  - ✅ 面板只读写「当前会话 cwd」的声明文件（与第一轮 provider per-cwd 语义一致），不跨工作区。测试点：测试步骤 4。
- **design 决策**：
  - 侧边栏入口落点：`sidebar.settings` 邻位 vs `ui-layout` frame seat vs `shell.overlay`（决策 D5）。
  - 面板形态：侧边栏入口 + 独立 overlay 面板（用户已定调）。
  - 写交互：逐条「添加/删除」即时保存 vs 编辑表单 + 显式保存按钮。

- **[引用声明读写 RPC]**：自定义 Typert Remote（如 `skillReference.list/add/remove`），host 端注册、client 端调用，写后触发第一轮 provider 的 invalidate。
- **推导出的约束**：
  - ✅ 第三方插件自定义 Remote 的正道已查证：包导出 `./typert`（host `TYPERT` manifest，`dsh-typert-loader` 自动发现注册进 `ctx.typert`）+ `./remote`（client `TypertRemoteContribution`，client 半注入 `dsh-api-remotes` 后 `ctx.remote.$mount`）；官方注释确认「hand-written wire schemas」合法，也可 host 端手动 `ctx.typert.register` + client 端手动 `$mount`。测试点：面板读/增/删 RPC 链路。
  - ✅ client `$mount` 强制 strict codec（拒绝非 strict），故每个参数/结果的 codec 须 `{mode:'strict', schema: zod}`——host/client 共享同一份 `InvocationDescriptor[]`（抽独立 contract 模块）。测试点：RPC 参数/结果编解码。
  - ✅ 写引用声明是 per-工作区本地文件，非 settings document → 不复用 `settings.*`。测试点：测试步骤 5/6。
  - ✅ 写操作 loopback-pinned（与 `agentPreset.copy/remove` 同类）。测试点：异常场景。
- **design 决策**：
  - RPC 挂载方式：`./typert`+`./remote` 双 artifact（自动发现）vs 手动 `register`/`$mount`。
  - codec 来源：手写 zod + `InvocationDescriptor` vs 引入 Typert 生成器。

- **[预览与目录选择]**：复用第一方已存在 RPC，不自造。
- **推导出的约束**：
  - ✅ `skill.list`（第一方只读，`dsh-host-apiproxy` 内）按 sessionId 定位 cwd，返回 `SkillEntry{name,description,whenToUse,modelInvocable}[]` → 面板预览直接用它。测试点：测试步骤 4/5/6。
  - ✅ `host.pickDirectory`（第一方）提供 native 目录选择器，返回选中目录路径 → 面板「添加引用」用它选源工作区根；路径由宿主机解析，浏览器不构造任意路径。测试点：测试步骤 5。
  - ✅ 第一方 `RpcMethodMap` 是封闭的（第三方不能新增方法，但能调用其中已有方法）→ 只能复用其只读/选择能力，写声明必须走自定义 Typert Remote。
- **design 决策**：
  - 源目录输入：native 选择器为主 + 手填路径兜底 vs 仅 native 选择器。

- **[写后即时生效]**：写 RPC 成功写回声明文件后，在**同一 host 进程内**直接调用第一轮 provider 的 invalidate（`setInvalidate(control.invalidate)` 已具备），catalog 重发现、`skill.list` 随之更新。
- **推导出的约束**：
  - ✅ 无需重启、无需额外 RPC——失效是本 host 进程内的直接回调。测试点：测试步骤 5/6 的「即时出现/消失」。
- **design 决策**：
  - RPC 模块与 provider 实例的接线：通过 `index.ts` 装配时注入 invalidate 回调 vs provider 暴露静态 resolver。