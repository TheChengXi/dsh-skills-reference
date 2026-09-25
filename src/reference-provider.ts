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
import type {
  SkillCandidate,
  SkillDefinition,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderObservation,
} from "@deepseek-ai/dsh-skill";
import { resolve } from "node:path";
import { REFERENCE_SKILL_RANK, isSkillAllowed, type ReferenceEntry } from "./schema.js";

export const PROVIDER_NAME = "skill-reference";

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
  logger?: { warn: (message: string) => void };
}

/** 一个引用源在缓存中的位置：声明原文（白名单过滤快照）+ 解析出的源目录 + 专属内层实例。 */
interface SourceSlot {
  entry: ReferenceEntry;
  dir: string;
  inner: InnerProvider;
}

interface CacheEntry {
  slots: SourceSlot[];
  /** 候选名 → 产出它的内层实例，供 get 委派（每次 list 重建）。 */
  owners: Map<string, InnerProvider>;
}

/** 把外层候选的 rank/provider 改写为引用源身份；导出便于单测。 */
export function restamp(candidate: SkillCandidate): SkillCandidate {
  return { ...candidate, rank: REFERENCE_SKILL_RANK, provider: PROVIDER_NAME };
}

export class ReferenceSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME;
  private readonly deps: ReferenceProviderDeps;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly watchers = new Map<string, () => void>();
  private invalidateFn: (() => void) | undefined;

  constructor(deps: ReferenceProviderDeps) {
    this.deps = deps;
  }

  /** 注册时注入 ctx.skills 的 invalidate 能力。 */
  setInvalidate(fn: () => void): void {
    this.invalidateFn = fn;
  }

  /** 供外部（RPC 写声明后）主动触发 ctx.skills 失效，使 catalog 重发现；provider 未创建时为 no-op。 */
  invalidate(): void {
    this.invalidateFn?.();
  }

  /** 主动失效指定 cwd 的内层缓存（dispose + delete）并触发全局 invalidate；供写声明后对该目标路径精准失效。 */
  async invalidateFor(cwd: string): Promise<void> {
    await this.onReferencesChanged(resolve(cwd));
  }

  async list(options: SkillLookupOptions): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
    const cwd = resolveCwd(options.cwd);
    const entry = await this.ensure(cwd);
    const merged: SkillCandidate[] = [];
    const owners = new Map<string, InnerProvider>();
    // 逐源串行：先过滤该源白名单，再按声明顺序 first-wins 合并，使「声明顺序靠前者优先」显式成立
    for (const slot of entry.slots) {
      const result = await slot.inner.list(options);
      const candidates = "candidates" in result ? result.candidates : result;
      for (const candidate of candidates) {
        if (!isSkillAllowed(slot.entry, candidate.name)) continue;
        if (owners.has(candidate.name)) continue;
        owners.set(candidate.name, slot.inner);
        merged.push(restamp(candidate));
      }
    }
    entry.owners = owners;
    return merged;
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const cwd = resolveCwd(options.cwd);
    const inner = this.cache.get(cwd)?.owners.get(candidate.name);
    if (inner === undefined) return undefined;
    const definition = await inner.get(candidate, options);
    if (definition === undefined) return undefined;
    return { ...definition, provider: PROVIDER_NAME };
  }

  /** 释放所有内层实例与声明 watcher。 */
  async dispose(): Promise<void> {
    for (const unwatch of this.watchers.values()) unwatch();
    this.watchers.clear();
    const inners = [...this.cache.values()].flatMap((entry) =>
      entry.slots.map((slot) => slot.inner),
    );
    this.cache.clear();
    await Promise.all(inners.map((inner) => inner.dispose()));
  }

  private async ensure(cwd: string): Promise<CacheEntry> {
    let desired: Array<{ entry: ReferenceEntry; dir: string }>;
    try {
      desired = (await this.deps.readReferences(cwd)).map((entry) => ({
        entry,
        dir: this.deps.resolveSourceDir(entry),
      }));
    } catch (error) {
      this.deps.logger?.warn(`skill-reference: failed to read references at ${cwd}: ${String(error)}`);
      desired = [];
    }

    const existing = this.cache.get(cwd);
    if (existing !== undefined) {
      if (sameDirs(existing.slots, desired)) {
        // 目录序列未变：只刷新声明快照（skills 白名单/展示名），复用内层实例以免白名单切换抖动 watcher
        existing.slots.forEach((slot, index) => {
          slot.entry = desired[index].entry;
        });
        return existing;
      }
      await Promise.all(existing.slots.map((slot) => slot.inner.dispose()));
      this.cache.delete(cwd);
    }

    const entry: CacheEntry = {
      slots: desired.map(({ entry: declaration, dir }) => ({
        entry: declaration,
        dir,
        inner: this.deps.createInner(dir),
      })),
      owners: new Map(),
    };
    this.cache.set(cwd, entry);
    this.startWatching(cwd);
    return entry;
  }

  private startWatching(cwd: string): void {
    if (this.watchers.has(cwd) || this.deps.watch === undefined) return;
    const unwatch = this.deps.watch(cwd, () => {
      void this.onReferencesChanged(cwd);
    });
    this.watchers.set(cwd, unwatch);
  }

  private async onReferencesChanged(cwd: string): Promise<void> {
    const entry = this.cache.get(cwd);
    if (entry !== undefined) {
      await Promise.all(entry.slots.map((slot) => slot.inner.dispose()));
      this.cache.delete(cwd);
    }
    this.invalidateFn?.();
  }
}

function resolveCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

function sameDirs(slots: SourceSlot[], desired: Array<{ dir: string }>): boolean {
  return (
    slots.length === desired.length && slots.every((slot, index) => slot.dir === desired[index].dir)
  );
}