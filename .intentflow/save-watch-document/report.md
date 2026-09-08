# save-watch-document 关账报告

## 1. 项目概览

修复跨工作区 skill 引用插件的「保存/监测」机制：声明文件 `.dsh/skill-references.yml` 不再依赖易漏报的单文件 stat 轮询，改为目录级可靠监测触发失效重发现，并锁定引用源按 cwd 的生效范围隔离（不跨工作区泄漏）。

## 2. 计划 vs 实际

- **功能1 引用声明文件实时监测** — ✅ 完成。新增 `src/reference-watch.ts`（目录级 `fs.watch` 过滤声明文件，覆盖修改/删除/重建/`.dsh` 创建），替换 `src/index.ts` 原 `fs.watchFile` 单文件轮询。
- **功能2 引用源生效范围隔离** — ✅ 完成。读驱动逻辑（`list` 按入参 cwd 读声明比对重建）原已正确，未改实现，仅补 `test/reference-provider.test.ts` 跨 cwd 隔离测试锁定。
- **功能3 失效链路收敛** — ✅ 完成。验证 RPC 与监测均已汇到 `provider.invalidate → control.invalidate`，未新建协调层，保留既有 rpc 失效断言。

## 3. 关键决策

- **监测技术选原生 `node:fs.watch` 目录级（D-A）**：不引入 chokidar、不沿用 `fs.watchFile` 升级。理由：覆盖删除/重建/原子替换且无新依赖。
- **范围隔离不改代码（D-B）**：确认 `ensure(cwd)` 已正确实现按入参 cwd 重算，缺的是测试锁定而非结构重构，故只补测试。
- **失效收敛不新造（D-C）**：确认 `provider.invalidate` 是唯一汇入点后，取消需求文档原设想的失效协调层。

## 4. 经验记录

- **有效做法**：先派子 agent 精读官方 `dsh-skill`/`dsh-skill-filesystem`/`dsh-session` 源码，定位「cwd 冻结 + 无工作区切换级失效」的实质，避免了在错误层级修复；「读驱动已正确」的验证避免了一次无谓结构重构。
- **踩坑**：`fs.watchFile` 单文件轮询对删除/原子替换漏报——正是 Bug2 的源头；`node --test` 默认多进程 spawn 在本机沙箱触发 EPERM。
- **工具反馈**：`pnpm` ps1 包装器把 stderr 回显当 `NativeCommandError`，干扰 exit code 判断（改用 `node node_modules/typescript/lib/tsc.js` 直跑规避）；`node --test` 目录参数在 `--test-isolation=none` 下报 `ERR_UNSUPPORTED_DIR_IMPORT`，须用 glob。

## 5. 后续待办

- **立即跟进**：真机重启 DSH 后，按 `requirement.md` 预设测试步骤 3/4/5（外部手改/整删/重进）与 6/7（跳转隔离）复测，确认两 bug 已消除。
- **长期备忘**：见 `D:\w_dev\dsh-skills-reference\.intentflow\save-watch-document\later-on.md`（L01 cwd 规范化错位、L02 chokidar 评估、L03 监测内建演进）。

## 6. 开发工作流反馈

- requirement→design 阶段对官方 DSH 机制依赖深，需读上游源码确认 cwd/catalog/invalidate 语义；建议此类插件需求在 design 前预留官方链路核查步骤。
- report 提交环节在本沙箱需留意 `spawn/EPERM` 边界（git 命令不捕获子进程 stdio，可正常）。
- 无。

## 7. 结论

- **当前状态**：可发布（宿主侧编译通过、30 测试全绿、稳定性 3 循环通过）。
- **建议下一步**：真机重启 DSH 复测 Bug1/Bug2，随后按需 `pnpm run sync` 同步到 DSH profile。