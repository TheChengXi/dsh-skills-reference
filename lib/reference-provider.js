import { resolve } from "node:path";
import { REFERENCE_SKILL_RANK, isSkillAllowed } from "./schema.js";
export const PROVIDER_NAME = "skill-reference";
/** 把外层候选的 rank/provider 改写为引用源身份；导出便于单测。 */
export function restamp(candidate) {
    return { ...candidate, rank: REFERENCE_SKILL_RANK, provider: PROVIDER_NAME };
}
export class ReferenceSkillProvider {
    name = PROVIDER_NAME;
    deps;
    cache = new Map();
    watchers = new Map();
    invalidateFn;
    constructor(deps) {
        this.deps = deps;
    }
    /** 注册时注入 ctx.skills 的 invalidate 能力。 */
    setInvalidate(fn) {
        this.invalidateFn = fn;
    }
    /** 供外部（RPC 写声明后）主动触发 ctx.skills 失效，使 catalog 重发现；provider 未创建时为 no-op。 */
    invalidate() {
        this.invalidateFn?.();
    }
    /** 主动失效指定 cwd 的内层缓存（dispose + delete）并触发全局 invalidate；供写声明后对该目标路径精准失效。 */
    async invalidateFor(cwd) {
        await this.onReferencesChanged(resolve(cwd));
    }
    async list(options) {
        const cwd = resolveCwd(options.cwd);
        const entry = await this.ensure(cwd);
        const merged = [];
        const owners = new Map();
        // 逐源串行：先过滤该源白名单，再按声明顺序 first-wins 合并，使「声明顺序靠前者优先」显式成立
        for (const slot of entry.slots) {
            const result = await slot.inner.list(options);
            const candidates = "candidates" in result ? result.candidates : result;
            for (const candidate of candidates) {
                if (!isSkillAllowed(slot.entry, candidate.name))
                    continue;
                if (owners.has(candidate.name))
                    continue;
                owners.set(candidate.name, slot.inner);
                merged.push(restamp(candidate));
            }
        }
        entry.owners = owners;
        return merged;
    }
    async get(candidate, options) {
        const cwd = resolveCwd(options.cwd);
        const inner = this.cache.get(cwd)?.owners.get(candidate.name);
        if (inner === undefined)
            return undefined;
        const definition = await inner.get(candidate, options);
        if (definition === undefined)
            return undefined;
        return { ...definition, provider: PROVIDER_NAME };
    }
    /** 释放所有内层实例与声明 watcher。 */
    async dispose() {
        for (const unwatch of this.watchers.values())
            unwatch();
        this.watchers.clear();
        const inners = [...this.cache.values()].flatMap((entry) => entry.slots.map((slot) => slot.inner));
        this.cache.clear();
        await Promise.all(inners.map((inner) => inner.dispose()));
    }
    async ensure(cwd) {
        let desired;
        try {
            desired = (await this.deps.readReferences(cwd)).map((entry) => ({
                entry,
                dir: this.deps.resolveSourceDir(entry),
            }));
        }
        catch (error) {
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
        const entry = {
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
    startWatching(cwd) {
        if (this.watchers.has(cwd) || this.deps.watch === undefined)
            return;
        const unwatch = this.deps.watch(cwd, () => {
            void this.onReferencesChanged(cwd);
        });
        this.watchers.set(cwd, unwatch);
    }
    async onReferencesChanged(cwd) {
        const entry = this.cache.get(cwd);
        if (entry !== undefined) {
            await Promise.all(entry.slots.map((slot) => slot.inner.dispose()));
            this.cache.delete(cwd);
        }
        this.invalidateFn?.();
    }
}
function resolveCwd(cwd) {
    return resolve(cwd ?? process.cwd());
}
function sameDirs(slots, desired) {
    return (slots.length === desired.length && slots.every((slot, index) => slot.dir === desired[index].dir));
}
