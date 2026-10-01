/**
 * @intent
 * cordis 插件装配入口：组装 schema / references-store / reference-provider / source-inspection / rpc / typert-host——
 * 注册 "skill-reference" provider 到 ctx.skills（复用官方 FileSystemSkillProvider 发现引用源），装配只读巡检模块
 * source-inspection（逐源 catalog），注册 SkillReferenceService 并发布 TYPERT 到 ctx.typert（使浏览器可调
 * list/replace/inspect），effect 卸载时回收内层实例与声明监测（reference-watch）。
 *
 * 边界：inject ['skills','sessions','typert']；内层官方实例 includeDefaultRoots:false 隔离自身根，且一律按单目录构造
 * （reference-provider 每源一个、source-inspection 每目录一个，均由同一 ctx/control 产出）；声明文件是宿主配置，直接走 node fs；
 * 目录存在性判定统一取 fs-directory（source-inspection 的 dirExists 即它本身）；
 * 声明变化经 reference-watch 目录级可靠监测触发失效；写声明（replace）成功后 service 回调 invalidate(targetPath)，
 * 经 provider.invalidateFor(cwd) 精准失效该 cwd 并触发 catalog 重发现。
 *
 * 验收条件：
 * - apply 后 ctx.skills.registerProvider 被调用一次且 provider 名为 "skill-reference"
 * - ctx.plugin 注册 SkillReferenceService（key "skillReference"），ctx.typert.register 注册 TYPERT（含 list/replace/inspect）
 * - service 注入的 invalidate 实为 provider.invalidateFor 闭包（按 cwd 精准失效）
 * - source-inspection 被装配并注入 service 的 inspect 入口，其 dirExists 为 fs-directory 的判定实现
 * - 内层工厂只接受单个目录，逐源/逐目录各建独立实例
 * - provider 释放走 ReferenceSkillProvider.dispose 回收资源；声明监测由 reference-watch 装配
 */
import type { Context } from "@deepseek-ai/cordis";
export declare const name = "skill-reference";
export declare const inject: string[];
export declare function apply(ctx: Context): void;
