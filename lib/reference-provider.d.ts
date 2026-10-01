/**
 * @intent
 * 外层 skill provider：把当前工作区声明的引用源 skills 目录逐源经官方 FileSystemSkillProvider 发现为候选，按各源声明的
 * skills 白名单过滤，再按声明顺序 first-wins 合并，改写候选 rank 为 REFERENCE_SKILL_RANK、provider 为 "skill-reference"，
 * 实现「引用源优先」的纯跟随语义与单 skill 粒度启停。
 *
 * 边界：provider.name 固定 "skill-reference"；声明为空或读失败 → list 返回空数组（空声明是合法空态，读失败降级为空并 warn）；
 * 每个引用源目录持有独立内层实例（候选归属是结构事实，不靠 path 前缀推断），list 内串行遍历使「声明顺序靠前者优先」
 * 显式成立；按 cwd 缓存，list 每次以入参 cwd 读声明比对目录序列——目录序列变化才重建内层实例，仅 skills/name 变化则就地
 * 更新过滤快照（避免白名单切换抖动 watcher）；get 按候选名委派给产出它的内层实例并把 definition.provider 改回
 * "skill-reference"；invalidateFor(cwd) 主动失效指定 cwd 的内层缓存并触发全局 invalidate（供写声明后精准失效）。
 *
 * 验收条件：
 * - 返回候选 rank === REFERENCE_SKILL_RANK 且 provider === "skill-reference"
 * - 不在某源 skills 白名单内的候选不出现在 list 结果；同名候选归属首个允许它的源
 * - 空声明返回空数组，不创建内层实例
 * - 仅 skills 变化时复用内层实例（不 dispose），目录序列变化时重建并触发 invalidate
 * - get 只对 list 产出过的候选名返回定义，owner 未知时返回 undefined
 * - invalidateFor(cwd) 只释放/删除该 cwd 的缓存并触发一次全局 invalidate，不影响其他 cwd 缓存
 * - 同一 provider 先 list({cwd:B}) 建引用、再 list({cwd:C 无声明}) 返回空（引用源不跨 cwd 泄漏）
 * - 引用源候选 rank(1) 小于本地 project-dsh(100)
 */
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderObservation } from "@deepseek-ai/dsh-skill";
import { type ReferenceEntry } from "./schema.js";
export declare const PROVIDER_NAME = "skill-reference";
/** 内层官方 provider 的适配面：list/get 加 dispose，供外层按 cwd 缓存与回收。 */
export interface InnerProvider {
    list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[] | SkillProviderObservation>;
    get: (candidate: SkillCandidate, options: SkillLookupOptions) => Promise<SkillDefinition | undefined>;
    dispose: () => Promise<void>;
}
export interface ReferenceProviderDeps {
    readReferences: (cwd: string) => Promise<ReferenceEntry[]>;
    resolveSourceDir: (entry: ReferenceEntry) => string;
    createInner: (sourceDir: string) => InnerProvider;
    watch?: (cwd: string, onChange: () => void) => () => void;
    logger?: {
        warn: (message: string) => void;
    };
}
/** 把外层候选的 rank/provider 改写为引用源身份；导出便于单测。 */
export declare function restamp(candidate: SkillCandidate): SkillCandidate;
export declare class ReferenceSkillProvider implements SkillProvider {
    readonly name = "skill-reference";
    private readonly deps;
    private readonly cache;
    private readonly watchers;
    private invalidateFn;
    constructor(deps: ReferenceProviderDeps);
    /** 注册时注入 ctx.skills 的 invalidate 能力。 */
    setInvalidate(fn: () => void): void;
    /** 供外部（RPC 写声明后）主动触发 ctx.skills 失效，使 catalog 重发现；provider 未创建时为 no-op。 */
    invalidate(): void;
    /** 主动失效指定 cwd 的内层缓存（dispose + delete）并触发全局 invalidate；供写声明后对该目标路径精准失效。 */
    invalidateFor(cwd: string): Promise<void>;
    list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation>;
    get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>;
    /** 释放所有内层实例与声明 watcher。 */
    dispose(): Promise<void>;
    private ensure;
    private startWatching;
    private onReferencesChanged;
}
