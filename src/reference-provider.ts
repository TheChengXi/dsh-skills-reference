/**
 * @intent
 * 外层 skill provider：把当前工作区声明的引用源 skills 目录，经官方 FileSystemSkillProvider 发现为候选，并改写候选 rank 为 REFERENCE_SKILL_RANK、provider 为 "skill-reference"，实现「引用源优先」的纯跟随语义。
 *
 * 边界：provider.name 固定 "skill-reference"；声明为空或读失败 → list 返回空数组（空声明是合法空态，读失败降级为空并 warn）；按 cwd 缓存内层实例，list 每次以入参 cwd 读声明比对 sourceDirs（引用源只对当前 cwd 的声明生效，不同 cwd 互不泄漏），变化时重建并 invalidate；get 委托给产生候选的内层实例并把 definition.provider 改回 "skill-reference"；invalidateFor(cwd) 主动失效指定 cwd 的内层缓存并触发全局 invalidate（供写声明后精准失效）。
 *
 * 验收条件：
 * - 返回候选 rank === REFERENCE_SKILL_RANK 且 provider === "skill-reference"
 * - 空声明返回空数组，不创建内层实例
 * - 声明变化后重建内层实例并触发 invalidate
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
import { REFERENCE_SKILL_RANK, type ReferenceEntry } from "./schema.js";

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
  createInner: (sourceDirs: string[]) => InnerProvider;
  watch?: (cwd: string, onChange: () => void) => () => void;
  logger?: { warn: (message: string) => void };
}

interface CacheEntry {
  sourceDirs: string[];
  inner: InnerProvider | undefined;
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
    if (entry.inner === undefined) return [];
    const result = await entry.inner.list(options);
    const candidates = "candidates" in result ? result.candidates : result;
    return candidates.map(restamp);
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const cwd = resolveCwd(options.cwd);
    const entry = this.cache.get(cwd);
    if (entry?.inner === undefined) return undefined;
    const definition = await entry.inner.get(candidate, options);
    if (definition === undefined) return undefined;
    return { ...definition, provider: PROVIDER_NAME };
  }

  /** 释放所有内层实例与声明 watcher。 */
  async dispose(): Promise<void> {
    for (const unwatch of this.watchers.values()) unwatch();
    this.watchers.clear();
    const inners = [...this.cache.values()].flatMap((entry) =>
      entry.inner === undefined ? [] : [entry.inner],
    );
    this.cache.clear();
    await Promise.all(inners.map((inner) => inner.dispose()));
  }

  private async ensure(cwd: string): Promise<CacheEntry> {
    let sourceDirs: string[];
    try {
      sourceDirs = (await this.deps.readReferences(cwd)).map((entry) =>
        this.deps.resolveSourceDir(entry),
      );
    } catch (error) {
      this.deps.logger?.warn(`skill-reference: failed to read references at ${cwd}: ${String(error)}`);
      sourceDirs = [];
    }

    const existing = this.cache.get(cwd);
    if (existing !== undefined && !sameDirs(existing.sourceDirs, sourceDirs)) {
      if (existing.inner !== undefined) await existing.inner.dispose();
      this.cache.delete(cwd);
    }

    let entry = this.cache.get(cwd);
    if (entry === undefined) {
      const inner = sourceDirs.length === 0 ? undefined : this.deps.createInner(sourceDirs);
      entry = { sourceDirs, inner };
      this.cache.set(cwd, entry);
      this.startWatching(cwd);
    }
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
      if (entry.inner !== undefined) await entry.inner.dispose();
      this.cache.delete(cwd);
    }
    this.invalidateFn?.();
  }
}

function resolveCwd(cwd?: string): string {
  return resolve(cwd ?? process.cwd());
}

function sameDirs(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}