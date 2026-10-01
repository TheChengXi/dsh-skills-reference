# desktop-adaptation 关账报告

## 1. 项目概览

把 dsh-skills-reference 插件从 DSH 0.1.x 运行时适配到 0.2.0-rc.2，使其能被桌面端插件管理器从 GitHub 一键安装并激活，且 web 端与桌面端统一到同一版本线。

## 2. 计划 vs 实际

**需求阶段功能清单**

- ✅ **运行时对齐**：peer 与开发依赖升到 `@deepseek-ai/dsh-skill` / `dsh-skill-filesystem` `^0.2.0-rc.2`、cordis `~4.0.4`，两端加载同一份 `lib/`。
- ✅ **桌面端一键安装**：新增 `dsh.bundle.patch` 与 `cordis.patch.yml`，`files`/`exports` 同步收录；用户已在桌面端插件页安装成功。
- 🔸 **安装后完整工作**：web 端已确认生效（入口与面板可用）；桌面端仅确认「安装成功」，面板侧功能（默认目标工作区、引用生效、启停）尚未按预设测试逐条走查。
- ✅ **web 端运行时升级**：由用户自行把全局 `@deepseek-ai/dsh` 升到 `0.2.0-rc.2` 并重启，升级后本插件随之恢复。

**设计改动点清单**

- ✅ 设计清单内 8 项全部落地（`package.json`、`cordis.patch.yml`、`.gitignore`、`README.md`、`lib/**`、`src/contract.ts`、`src/client/controller.ts`、`build.mjs`、两个测试文件）。
- ✅ 执行期追加 3 项（设计文档已同步记录）：`pnpm-workspace.yaml` 的 `allowBuilds` 明确化、`pnpm-lock.yaml` 更新、`sync.mjs` 目标路径语义修正。
- 🔸 计划外的破坏与修复：`sync.mjs` 误把 `DSH_PROFILE_DIR` 当插件目录，覆盖了 desktop profile 的 `package.json` 并建出多余 `lib/`；已复原 profile 清单、删除误建目录并修掉根因。

## 3. 关键决策

- **D3/D4 由「双兼容」改为「只对齐 0.2.0」**：设计阶段原推荐 codec 同时保留 `schema` 与 `create`、会话来源写成 `current ?? retainedBy.mainView`；用户选择单一目标，于是 codec 只留 `create()`、会话来源只读 `retainedBy.mainView`。代价是 web 端在完成 dsh 升级前插件不可用——用户已先升级，代价未实际发生。
- **执行期新增 `sync.mjs` 语义修正（设计外）**：原脚本把 `DSH_PROFILE_DIR` 当插件目录，而 DSH 注入的是 profile 根。改为 `<profile 根>/node_modules/dsh-skills-reference`，并补非 web profile 的加载提示。
- **构建产物入库而非 `prepare` 构建**：pnpm 10.26+ 默认阻止 git 依赖的 prepare，走产物入库才能满足「一键安装」。实测从 GitHub 拉包确认 `files` 会过滤内容、`cordis.patch.yml` 因被列入而保留。
- **`dsh.client.inject` 换为 conversation + layout**：官方双半模板的 inject 写的是插件实际挂载 slot 的所属包；原 `@deepseek-ai/dsh-client-runtime` 在 0.1.5 与 0.2.0 都不存在。

## 4. 经验记录

**有效做法**

- **用 asar 提取 + 与官方包逐行 diff 来判定 API 差异规模**：得到「`dsh-skill` 仅差 1 行、`dsh-skill-filesystem` 差 17/9 行且均为内部实现」这个结论，直接把宿主侧改动面收敛到零，避免了按猜测重构。
- **把设计文档的验收条件转成可执行断言**：交付面 24 项（`bundle.patch`/`files`/`exports`/peer/产物形态）与集成 5 项（host 真实加载 + client bundle 真实执行 + `$mount` 的 codec 契约）都可重复运行，比人工核对可靠；集成脚本用桩 `__ModuleLoader__` + 桩 ctx 真跑 client bundle，**不上桌面就验出了会让 client 半整体不激活的那道校验**。
- **从 GitHub 拉一次包做交付面验证**：证实 `files` 过滤行为与 patch 文件随包发布，这条在调研阶段只能标注「未实测」。
- **后台调研用「先发中间结论、后发完整报告」**：安装侧的第一条中间结论（`not-bundle` 是第二道独立门槛）让设计方向提前修正，省掉一轮返工。

**踩坑**

- **`DSH_PROFILE_DIR` 语义误判（本次最严重）**：在 DSH 会话内执行 `pnpm run sync` 时该变量被注入为 profile 根，而脚本把它当插件目录，导致 desktop profile 的 `package.json` 被插件清单覆盖、根下多出 `lib/`。教训：任何"投放/覆盖文件"的脚本，在把环境变量拼进路径前必须先用一条只读命令打印解析结果。
- **需求阶段对 client 侧判断过于乐观**：第一版结论是「client 零代码改动」，后被契约实证推翻（Typert codec 的 `create()`、`sessions` 快照无 `current`）。跨运行时适配类需求，契约实证不应留到设计阶段。
- **会话中途沙箱策略变化**：`ask` → `never` → `danger-full-access` 的切换让若干 npm/pnpm 命令以权限错误失败并重试，消耗了轮次。

**工具反馈**

- `edit` 要求先 `read`，而长会话中读取凭据会失效，导致同一文件需重复读取。
- `web_fetch` 在开启本地代理后会把 `raw.githubusercontent.com` 解析为非公网 IP 而被拒，验证远端内容只能改走 `git`/`pnpm` 侧。

## 5. 后续待办

**立即跟进**

- 桌面端按需求文档「预设测试」逐条走查：`skill` 入口出现 → 面板默认目标工作区＝当前会话 cwd → 声明引用源并保存 → 源新增 skill 实时刷新 → 单 skill 启停保存后生效。
- 确认 desktop profile 的 `dsh.profile.bundles` 是否需要保留 `@deepseek-ai/dsh-experimental-voice-input-bundle`（事故恢复时按原状写回了三个 bundle）。
- 删除 `.tmp/`（本次调研的 asar 提取物，约 7.9 MB，已加入 `.gitignore`）。

**长期备忘**

见 [`D:\w_dev\dsh-skills-reference\.intentflow\desktop-adaptation\later-on.md`](D:\w_dev\dsh-skills-reference\.intentflow\desktop-adaptation\later-on.md)：L01 恢复 0.1.5 运行时支持、L02 统一两端安装路径、L03 desktop 同步脚本、L04 发布 npm registry、L05 client bundle 分包、L06 0.2.0 主题视觉复核、L07 peer 范围自动一致性检查。

## 6. 开发工作流反馈

- **requirement 阶段缺「目标运行时契约实证」这一环**：本次「实现对齐」最初建立在官方文档与既有代码的推断上，两处硬性破坏点直到 design 阶段才被实证推翻，直接改变了改动点清单。建议对「跨版本/跨环境适配」类需求，在 requirement 阶段就强制产出「目标运行时接口差异表」。
- **execute 的「集成验证」缺现成手段**：插件类交付物没有可直接调用的宿主，本次自建了桩驱动的集成脚本。这类脚本（浏览器式 `__ModuleLoader__` 桩 + ctx 桩）具备复用价值，值得沉淀为插件项目的模板。
- **design 的「改动点清单」在执行期容易被现实修正**：本次追加了 3 项（工具链配置、lockfile、同步脚本语义）。清单宜显式区分「源码改动」与「环境/工具链改动」，后者更容易在设计阶段被漏掉。

## 7. 结论

- **当前状态**：可发布。两端运行时已统一到 0.2.0-rc.2；web 端确认生效；桌面端经插件管理器安装成功，代码已推送 GitHub（`a3c74bb`）。
- **建议下一步**：在桌面端走完预设测试的 5 个步骤以关闭「🔸 部分完成」这一项；随后清理 `.tmp/`，并按 later-on 的触发条件处理 L01/L02。
