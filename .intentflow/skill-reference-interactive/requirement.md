# 需求文档：skill 引用交互显式化（跨工作区引用可视化操控）

## 项目意图
突破现有「面板只服务当前会话 cwd」的黑箱，让用户在面板里**显式指定任意目标工作区**，为它增删 skill 引用源并逐源观测「是否导入要引用的源头」，使「为某工作区声明引用另一工作区」成为页面里可控、可见的显式动作。

## 功能清单
1. **skill 引用声明**：引用方在工作区本地声明「来源工作区」清单。— ✅ 既有交付（第一轮）
2. **skill 引用注册**：复用官方 `dsh-skill-filesystem` 发现机制，把来源工作区的 skill 注册进目标工作区会话。— ✅ 既有交付（第一轮）
3. **可视化 skill 操作窗口**：侧边栏入口 + 面板，查看/添加/删除引用，预览引用结果。— ✅ 既有交付（第二轮，当前会话 cwd 作用域）
4. **任意目标工作区显式指定**：面板顶部可指定任意目标工作区根路径作为管理对象，突破当前会话 cwd 黑箱。— 🎯 本轮焦点
5. **跨工作区引用声明读写**：为被指定的任意目标工作区增/删引用源（写其本地声明文件）并即时生效。— 🎯 本轮焦点
6. **引用源健康度逐源标注**：面板标注每个引用源是否成功导入 + 每个 skill 来自本地还是哪个引用源。— 🎯 本轮焦点

## 核心功能

### 核心功能1：skill 引用声明（既有交付）
- **能力**：系统能够 读取 引用方工作区本地 `.dsh/skill-references.yml`，每项为「展示名 + 源工作区根路径」。
- **业务价值**：用一份声明文件替代「复制粘贴 skill 目录到每个工作区」。

### 核心功能2：skill 引用注册（既有交付）
- **能力**：系统能够 把声明里的每个源工作区 `.dsh/skills` 目录 注册为 目标工作区的 skill 来源，并随源目录变化自动失效重发现。
- **业务价值**：源工作区更新 skill 后，所有引用它的工作区在下一轮自动用上最新版本。

### 核心功能3：任意目标工作区显式指定（本轮焦点）
- **能力**：系统能够 在面板顶部接受任意「目标工作区根路径」（默认当前会话 cwd，可经 `host.pickDirectory` 选择或手填切换），并以它为对象查看、增、删引用源——为指定工作区声明它对另一工作区 skill 的引用，写回该目标工作区本地声明文件并即时生效。
- **业务价值**：把「为工作区声明引用」从黑箱变成显式、可控的动作——用户可主动操纵任何一个工作区去引用另一个工作区的 skill，不限当前会话。
- **异常处理**：目标工作区路径不存在或不可读 → 面板提示「目标不可用」，写操作禁用，不误建 `.dsh` 目录。

### 核心功能4：引用源健康度逐源标注（本轮焦点）
- **能力**：系统能够 为目标工作区分两个层次呈现——①逐源标注：每个被声明的引用源是否成功导入（源目录真实存在且发现到 skill）；②逐 skill 标注：预览区的每个 skill 标注来源（本地 / 哪个引用源）。
- **业务价值**：直接回应「可观测到是否导入要引用的 skill 源头」——用户一眼看出哪些源头生效、每个生效 skill 从哪来，补上聚合预览无法体现的来源信息。
- **异常处理**：某引用源不可用 → 该源单独标记「未生效/不可用」，不阻断其他生效源与其他预览。

## 业务规则

### 引用模型（沿用）
- **场景**：工作区 B 复用开发工作区 A 的 skill。
- **行为**：B 在本地 `.dsh/skill-references.yml` 写「展示名 + A 的工作区根路径」，插件自动取 `<A>/.dsh/skills`。A 无需任何额外动作。
- **异常处理**：源路径不存在或不可读 → 该引用源整体跳过并提示，不阻断其他引用源。

### 引用语义（纯跟随，沿用）
- **场景**：引用建立后，本地想改动被引用的 skill。
- **行为**：引用是只读跟随——本地不改被引用的 skill，改动回源工作区统一改；本地不做派生态。
- **异常处理**：无。本地派生态延后（reference 后续特化，非本轮）。

### 同名冲突（沿用）
- **场景**：引用源里的 skill 名与目标工作区本地 `.dsh/skills` 同名。
- **行为**：引用源优先（引用来的 rank=1 生效，本地同名视为待淘汰旧副本）。
- **异常处理**：多个引用源之间同名 → 按声明顺序靠前者优先（既有 design 已定）。

### 目录级引用（沿用）
- **场景**：建立引用。
- **行为**：整个 `<源>/.dsh/skills` 目录作为一体被引用，不支持逐条挑单个 skill。
- **异常处理**：无。单 skill 粒度延后（reference 后置）。

### 声明变更即时生效（沿用）
- **场景**：新增、删除、修改引用声明。
- **行为**：声明文件变更 → provider 失效并重发现；面板操作写回文件后立即触发同一失效链。
- **异常处理**：声明文件语法错误 → 面板提示解析失败；provider 侧降级为清空引用并 warn，不阻断其他工作区。

### 面板作用域（本轮重构，取代既有「仅当前会话」约束）
- **场景**：打开面板。
- **行为**：面板顶部含「目标工作区」字段，默认 = 当前会话工作区（cwd）；用户可经 `host.pickDirectory` 选择任意工作区根路径或手填切换到其它工作区；面板此后只读写**该目标工作区**本地 `.dsh/skill-references.yml`，并对它做健康度/预览。
- **异常处理**：目标工作区读不到 → 面板显示「目标不可用」占位，写操作禁用；无有效 cwd 会话时仍可手填/选择目标工作区（不依赖会话）。

### 写路径安全（沿用并扩展）
- **场景**：面板写引用声明。
- **行为**：写声明走宿主机自定义 RPC（loopback-pinned）；源/目标工作区路径由第一方 `host.pickDirectory` 选定或手填后经宿主机解析；浏览器端不传任意拼装路径。
- **异常处理**：非 loopback 请求一律拒绝；目标工作区路径不含有效工作区结构 → 拒绝写。

### 引用源健康度判定（本轮新增）
- **场景**：面板展示目标工作区引用源。
- **行为**：每个声明条目标注「生效/未生效」——解析出源目录路径，若源目录存在且 `skill.list`/源摘要能发现 skill 则生效；否则标记不可用。
- **异常处理**：源目录存在但该源下无 skill → 视为「已挂载但为空源」提示，仍视为声明成功但健康度降级。

## 预设测试

### 前置条件
- 工作区 SRC（开发）：`D:\dev\skill-dev`，含 `.dsh/skills/alpha/SKILL.md`（name: alpha）。
- 工作区 B（当前会话打开）：`D:\dev\project-b`，初始无 `.dsh/skill-references.yml`。
- 工作区 TARGET（第三方工作区，非当前会话）：`D:\dev\project-t`，初始无 `.dsh/skill-references.yml`。

### 测试步骤

1. **[面板作用域突破]**：在 B 打开会话，侧边栏点「skill 引用」。
   **预期结果**：面板打开，顶部「目标工作区」默认显示 `D:\dev\project-b`，预览/声明均为 B 的。
2. **[指定第三方目标工作区]**：面板顶部用目录选择器选 `D:\dev\project-t`（或手填）。
   **预期结果**：面板管理对象切换为 TARGET；声明区显示 TARGET 现有条目（初始空）；预览区显示 TARGET 已生效 skill（初始空）。
3. **[为 TARGET 声明引用 SRC]**：TARGET 视图下「添加引用」→ 源目录选 `D:\dev\skill-dev` → 填展示名「skill-dev」→ 保存。
   **预期结果**：`D:\dev\project-t/.dsh/skill-references.yml` 出现 `{name: skill-dev, path: D:\dev\skill-dev}`；面板预览区出现 alpha（来源标注「来自 skill-dev」）；切回 B 时 B 的声明不受影响。
4. **[健康度逐源标注]**：TARGET 视图下，将 SRC 改名/删除后再刷新面板。
   **预期结果**：该引用源条目显示「未生效/不可用」，alpha 从预览消失或对应条目降级，其他生效源/预览不受影响。
5. **[双向独立]**：为 B 也声明引用 SRC，再把 TARGET 声明清掉。
   **预期结果**：B、TARGET 各自声明互相独立；删 TARGET 引用后 alpha 从 TARGET 预览消失，B 仍保留 alpha。
6. **[当前会话仍可写]**：B 视图下增删引用并保存。
   **预期结果**：行为与既有一致，`B/.dsh/skill-references.yml` 正确写入、即时生效。

### 异常场景

- **[目标工作区不可用]**：面板指定不存在/不可读路径 → 面板提示「目标不可用」，写操作禁用，不误建 `.dsh` 目录。
- **[源路径失效]**：被引用的 SRC 被删除 → 面板该引用源标「未生效」，alpha 预览消失，其他源不受影响。
- **[声明损坏]**：目标工作区的 `.dsh/skill-references.yml` 被外部改坏 → 面板对该目标提示解析失败（不崩溃、不误写）；provider 侧清空引用并 warn。
- **[无当前会话]**：无有效会话 cwd 时打开面板 → 面板目标工作区留空可手填/选择，不阻断对其它工作区的管理。
- **[非 loopback / 任意路径注入]**：浏览器端尝试传入拼装路径或非本机请求 → 宿主拒绝，面板报错，文件不变。

## 边界收束

**此时必做**：
- 面板顶部「目标工作区」字段（默认当前会话 cwd，支持 `pickDirectory` 选择 + 手填切换）。
- 声明读写 RPC 支持显式目标工作区路径入参（不再依赖当前会话 sessionId→cwd 定位）。
- 为目标工作区写声明后即时失效对应 provider（按目标 cwd 触发失效）。
- 逐源健康度标注 + 逐 skill 来源标注（新增只读来源查询能力）。

**此时不做**：
- 全景多工作区关系拓视图（单工作区视角已覆盖；全景属过渡设计，延后）。
- 单 skill 粒度引用 / 白名单（延后）。
- agents 文件引用（延后）。
- 本地特化 / 派生 + 上游同步追踪（延后）。
- 面板对目标工作区的持久记忆列表（面板内临时指定即可，持久记忆延后）。

## 实现对齐

现状基线（既有交付，见 `.intentflow/_packages/dsh-skills-reference.yml`）：
- `schema.ts`：`ReferenceEntry{name,path}`、`parse/serializeReferences`、`resolveSourceDir`、`REFERENCE_SKILL_RANK=1`、`REFERENCES_FILENAME`。
- `references-store.ts`：`resolveReferencesFile(cwd)`、`readReferences(cwd)`、`writeReferences(cwd, entries)`。
- `reference-provider.ts`：外层 `SkillProvider`，按 **cwd** 缓存内层 `FileSystemSkillProvider`，`setInvalidate(fn)`/`dispose()`。
- `contract.ts` / `typert-host.ts` / `rpc.ts`：`SkillReferenceService.list(sessionId)` / `.replace(sessionId, entries)`，经 `ctx.sessions` 解析 cwd。
- client 半：`controller.ts`（锚定 sessionId→cwd）、`panel.tsx`、`typert-remote.ts`、`client.ts`（slots 注册）。

本轮新增（Node host 半 + Web client 半）：

- **[目标工作区显式指定]**：client `controller` 增加「目标工作区根路径」状态；RPC `list/replace` 入参由 `sessionId` 改为（或扩展为）显式 `targetPath`，宿主不再依赖当前会话解析 cwd。
  - **推导出的约束**：✅ 宿主 `resolveReferencesFile/writeReferences` 本就按 cwd 定位，把 cwd 从「session 解析」改为「显式 targetPath」即可，改动落在 rpc/controller，不动 store/schema。测试点：测试步骤 2/3。
  - **design 决策**：RPC 签名为「`{targetPath}` 替换 `{sessionId}`」还是「保留 sessionId 兼容 + 新增 targetPath」。

- **[为目标工作区即时失效]**：写 `replace(targetPath, ...)` 成功后，宿主按 `targetPath` 触发对应 `reference-provider` 内层实例的 invalidate（provider 本就 per-cwd 缓存）。
  - **推导出的约束**：✅ `reference-provider` 已 per-cwd 缓存内层实例、具备 `invalidate`；只需 service 写入后按目标 cwd 取到对应实例失效。测试点：测试步骤 3 的「预览区即时出现 alpha」。
  - **design 决策**：provider 实例到 cwd 的取用方式（静态 resolver vs service 注入回调表）。

- **[逐源健康度 + 来源标注]**：新增**只读**来源查询能力——按目标 cwd 读各声明条目的源目录，判定源是否生效 + 列出该源发现到的 skill；预览区把 `skill.list` 结果与「本地 vs 引用源」对应起来（复用 provider per-cwd `FileSystemSkillProvider` 的候选，或对 `skill.list` 结果做来源回查）。
  - **推导出的约束**：✅ 判定「源目录存在 + 源内发现 skill」可直接对每个引用源调用宿主侧 skill resolution；来源标注需把宿主 `skill.list` 结果与声明条目按 cwd 映射。测试点：测试步骤 4/5。
  - **design 决策**：来源标注实现为「新增独立只读 RPC 逐源查询」还是「增强现有 list 返回来源信息」。

- **写路径安全**：沿用 loopback-pinned + `pickDirectory`/手填 + 宿主解析，扩展「目标工作区路径」同样走宿主解析与有效工作区结构校验。
  - **推导出的约束**：✅ 与既有 loopback 约束一致，无新增安全隐患模型；目标 path 校验复用源 path 的宿主导入式。测试点：异常场景-任意路径注入。

与预设测试的关系：目标指定（步骤1/2）、跨工作区声明（步骤3/5/6）、逐源健康度（步骤4）、安全（异常-注入）均有对应测试点。
