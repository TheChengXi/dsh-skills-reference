# 需求文档：跨工作区技能引用的保存与监测修复

## 项目意图

修复 `dsh-skills-reference` 插件的保存/监测机制：让 `.dsh/skill-references.yml`（跨工作区引用声明）的变化被**可靠实时监测**并触发失效重发现（不再依赖脆弱的单文件轮询），同时让引用源 skill 的**生效范围按当前会话工作区正确隔离**（不泄漏到没有该声明的工作区）。

## 功能清单

1. **引用声明文件实时监测**：`.dsh/skill-references.yml` 的新增、修改、整文件删除、原子替换都能可靠触发失效，使引用源 skill 即时消失/出现，无需重启。
2. **引用源生效范围隔离**：引用源 skill 只对「声明了它、且会话 cwd 匹配」的工作区生效；切换/进入其它工作区后不再可见。
3. **失效链路与官方 catalog 对齐**：声明变化能汇入官方 `control.invalidate`（唯一 revision++ 入口），并与「UI 写后立即失效」「外部手改失效」两条路径收口为同一链路。

> 说明：既有需求 `.intentflow/skill-reference/requirement.md` 的「声明变更即时生效」规则已声明过这些期望，本轮正是兑现该规则、堵住实现缺口。

## 核心功能

### 核心功能1：引用声明文件实时监测
- **能力**：系统能够 对 `.dsh/skill-references.yml` 建立如同官方监控本地 skill 目录那样可靠的监测（含删除、重建、原子替换），任一变化 → 引用源失效重发现，无需重启。
- **业务价值**：无论通过 UI 还是直接改文件，引用方的技能在下一轮立即随声明更新或消失；修补"绕过 UI 删除后仍被使用"的漏洞。

### 核心功能2：引用源生效范围隔离
- **能力**：系统能够 让引用源技能只属于「声明了它且当前会话 cwd 匹配」的工作区，切到没有声明的其它工作区即不可见。
- **业务价值**：工作区 B 引用的技能不会泄漏到工作区 C，杜绝跨工作区污染与隐私/语义串台。

### 核心功能3：失效链路收敛
- **能力**：系统能够 让所有会导致引用源变化的信号（UI 写回、外部改文件、整文件删除）统一汇入同一条失效链路，不做互不相同、各自依赖独有触发条件的多条路径。
- **业务价值**：消除"UI 即时生效、外部改不生效"的不一致，使失效行为可预测、可测试。

## 业务规则

### 声明变化即时生效
- **场景**：新增、删除、修改、整删、重建 `.dsh/skill-references.yml`（含面板操作与外部手改）。
- **行为**：声明文件变化 → 引用源失效并重发现，无需重启；UI 写操作与外部改动走同一失效链路。
- **异常处理**：声明文件语法错误 → 面板提示解析失败；provider 侧降级为清空引用并 warn（沿用既有行为），不阻断其它工作区。

### 生效范围随会话 cwd 隔离
- **场景**：在声明工作区打开会话，或切换到另一工作区。
- **行为**：仅当前会话 cwd 对应工作区的声明被加载为引用源；其它工作区不加载其声明，引用源技能不跨工作区泄漏。
- **异常处理**：无法确定当前会话 cwd → 不激活任何引用源（此时为空态）。

### 失效收敛
- **场景**：任何引用源发生变化。
- **行为**：单一失效链路（provider 侧触发 `control.invalidate`）负责 catalog 重发现；不并存多条触发条件互异的失效路径。
- **异常处理**：失效失败不得静默 —— 至少 warn，保证可观测。

## 预设测试

> 从用户视角可执行的测试：直接复现用户报告的两个 bug，验证修复后不再复现。

### 前置条件
- 源工作区 A：`D:\dev\skill-dev`，含 `.dsh/skills/alpha/SKILL.md`（name: alpha）。
- 引用工作区 B：`D:\dev\project-b`，`.dsh/skill-references.yml` 含 `{name: skill-dev, path: D:\dev\skill-dev}`。
- 其它工作区 C：`D:\dev\project-c`，无任何 `.dsh/skill-references.yml`。

### 测试步骤

> 对应 Bug2（保存/监测）：

1. **[建立引用]**：在 B 打开会话，确认能看到来自 A 的 alpha。
   **预期结果**：B 会话发现 alpha。

2. **[UI 写后即时]**：面板删除对 A 的引用 → 保存。
   **预期结果**：B 会话即时不再发现 alpha（无需重启），`skill-references.yml` 对应行被移除。

3. **[外部手改即时]**：用文本编辑器把 `{name: skill-dev, path: D:\dev\skill-dev}` 条目从 `B/.dsh/skill-references.yml` 删除 → 回到 UI 触发一次 skill 载荷。
   **预期结果**：alpha 即时消失，**无需重启**。

4. **[整删声明]**：在资源管理器直接删除 `B/.dsh/skill-references.yml` → 回到 UI 触发一次 skill 载荷。
   **预期结果**：alpha 即时消失，无需重启。

5. **[重进后仍正确]**：删除声明后退出并重进 DSH 端口 → 在 B 会话再触发一次 skill 载荷。
   **预期结果**：B 不再发现 alpha（删除已生效且被持久监测）。

> 对应 Bug1（范围隔离）：

6. **[跳转隔离]**：B 会话已引用 A（能看到 alpha）。切换到 C 工作区打开新会话 → 触发 skill 载荷。
   **预期结果**：C 会话不出现 alpha（C 无声明）；再切回 B 会话，alpha 重新出现。

7. **[回切恢复]**：接步骤 6，切回 B 会话。
   **预期结果**：B 会话仍能发现 alpha，且只属于 B。

### 异常场景

- **[声明损坏]**：`B/.dsh/skill-references.yml` 被外部改坏 → 面板打开提示解析失败（不崩溃、不误写）；当前会话引用源清空并 warn，其它工作区不受影响。
- **[整删后 UI 写回]**：整删声明 → 面板保存空列表。 **预期**：写回空数组 YAML，仍为空态，无残留 alpha。
- **[源路径失效]**：A 被删除或改名 → B 继续操作 → alpha 静默消失，面板提示该引用源不可用，其他引用源不受影响。

## 边界收束

**此时必做**：
- 声明文件成为「可靠监测对象」（不再单靠 `fs.watchFile` 单文件轮询兜底）。
- 外部手改 / 整删声明能触发同一失效链路（对齐 UI 写路径）。
- 引用源生效范围与「当前会话 cwd 的声明」绑定（修复跨工作区泄漏）。

**此时不做**：
- 全局/多工作区批量同步声明 — 超出对象范围，触发条件：出现多工作区批量管理需求时再评估。
- 引入第三方 watch 引擎替换官方 provider — 归属 design，不在此需求内。

## 实现对齐

现状基线（已在源码核实）：
- `src/references-store.ts`：`resolveReferencesFile(cwd)` 用 `resolve(cwd)/.dsh/skill-references.yml`，`readReferences`/`writeReferences` 走 node fs。
- `src/reference-provider.ts`：`ReferenceSkillProvider` 按 cwd 缓存内层实例（`cache: Map<cwd, CacheEntry>`），`ensure(cwd)` 读声明建内层、`startWatching(cwd)` 只对首次 cwd 建 watcher；`onReferencesChanged` 清缓存并 `invalidate`。
- `src/index.ts`：`watchReferencesFile` 用 `fs.watchFile(声明文件, {persistent:false, interval:500})` 是唯一外部失效信号；`makeInner` 用 `includeDefaultRoots:false` + 固定 `customSkillDirs=[引用源]`，内层 roots 对 cwd 不敏感。
- 官方机制（`dsh-skill/lib/index.js`）：catalog 缓存键含 `cwd/scope/revision`（:270,395-401）；无工作区切换级 invalidate；显式失效仅来自 provider watcher（revision++）。
- 官方监控 skill 目录用 chokidar `persistent:true`（`dsh-skill-filesystem:371-384`），仅对"尚不存在的祖先"降级 `watchFile persistent:false`（:342-356）。

- **[功能1 声明实时监测]**：把「声明变化→失效」从唯一依赖 `fs.watchFile` 轮询，改为对声明文件所在 `.dsh/` 目录（或声明文件本身）建立与官方同档的可靠监测，监听器统一走 `onReferencesChanged → control.invalidate`。
- **[功能2 范围隔离]**：让引用源敏感度从"依赖官方 cache key 触发 `ensure(cwd)`"改为 provider 侧对当前 cwd 声明主动重算——每次进入/切到工作区都按该 cwd 重新读声明并比对，杜绝 A 穿透到 C。
- **[功能3 失效收敛]**：UI 写回（`rpc.replace` 后直接 `invalidate`）与外部监测合流为同一失效入口，消除多路径不一致。

- **推导出的约束**：
  - ✅ 引用声明文件是宿主工作区配置，仍需直接走 node fs 读写（不经沙箱 ctx.fs）；测试点：测试步骤 3/4/5。
  - ✅ 官方 catalog 唯一失效入口是 `control.invalidate`；任何声明变化必须最终汇入它才能让 `skill.list` 刷新；测试点：测试步骤 2/3/4。
  - ✅ 会话 cwd（`session.header.cwd`）创建即冻结、运行时不被切换改写；引用源范围只能靠「按 cwd 主动读声明」达成而不能依赖官方在切换时回调；测试点：测试步骤 6/7。
  - ✅ `makeInner` 用 `includeDefaultRoots:false`，内层 roots 只含固定 customSkillDirs，与 options.cwd 无关——范围隔离不能落在内层，只能落在外层按声明重算/监测；测试点：步骤 5/6。

- **design 决策**：
  - 声明监测技术（A）：对 `.dsh/` 用 chokidar 目录 watcher 过滤 `skill-references.yml`（与官方同档、可处理删除/重建） vs（B）：每次 list 前重新读声明并与已缓存比对（无 watcher、读驱动） vs（C）：`fs.watchFile` 升级 `persistent:true` + 缩 interval 并补删文件探测。指向 A 或 B（C 不足以覆盖原子替换/rename）。
  - 范围隔离（D）：外层放弃 per-cwd 实例长缓存、每次 list 按当前 cwd 强制重算 sourceDirs 并比对是否变化（读驱动、与 B 一致） vs（E）：承接 B 的读驱动思想，把「声明感知」做成 provider 核心，cwd 变化或内容变化都收敛回同一失效。倾向 E 以统一功能 1/2/3。
  - 失效入口（F）：统一在 provider 侧由 `onReferencesChanged`（内容/目录变化或进入新 cwd）触发 `control.invalidate`，RPC 写后仅更新缓存标记再由同一入口失效；消除「RPC 直接 invalidate」与外部 watcher 的两条并行路（G：维持现状双入口）。倾向 F。
