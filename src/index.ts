/**
 * @intent
 * cordis 插件装配入口：组装 schema / references-store / reference-provider / source-inspection / rpc / typert-host——
 * 注册 "skill-reference" provider 到 ctx.skills（复用官方 FileSystemSkillProvider 发现引用源），装配只读巡检模块
 * source-inspection（逐源 catalog），注册 SkillReferenceService 并发布 TYPERT 到 ctx.typert（使浏览器可调
 * list/replace/inspect），effect 卸载时回收内层实例与声明监测（reference-watch）。
 *
 * 边界：inject ['skills','sessions','typert']；内层官方实例 includeDefaultRoots:false 隔离自身根；声明文件是宿主配置，直接走 node fs；
 * 声明变化经 reference-watch 目录级可靠监测触发失效；写声明（replace）成功后 service 回调 invalidate(targetPath)，
 * 经 provider.invalidateFor(cwd) 精准失效该 cwd 并触发 catalog 重发现；source-inspection 的逐源列表工厂用同一 ctx/control 构造官方单目录实例。
 *
 * 验收条件：
 * - apply 后 ctx.skills.registerProvider 被调用一次且 provider 名为 "skill-reference"
 * - ctx.plugin 注册 SkillReferenceService（key "skillReference"），ctx.typert.register 注册 TYPERT（含 list/replace/inspect）
 * - service 注入的 invalidate 实为 provider.invalidateFor 闭包（按 cwd 精准失效）
 * - source-inspection 被装配并注入 service 的 inspect 入口
 * - provider 释放走 ReferenceSkillProvider.dispose 回收资源；声明监测由 reference-watch 装配
 */
import type { Context } from "@deepseek-ai/cordis";
import { FileSystemSkillProvider } from "@deepseek-ai/dsh-skill-filesystem";
import type { SkillProviderControl } from "@deepseek-ai/dsh-skill";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readReferences } from "./references-store.js";
import { watchReferencesFile } from "./reference-watch.js";
import { resolveSourceDir } from "./schema.js";
import {
  PROVIDER_NAME,
  ReferenceSkillProvider,
  type InnerProvider,
} from "./reference-provider.js";
import { SourceInspection, type SkillSummaryLike } from "./source-inspection.js";
import { SkillReferenceService } from "./rpc.js";
import { TYPERT } from "./typert-host.js";

interface TypertRegisterLike {
  register(contribution: unknown): unknown;
}

export const name = "skill-reference";
export const inject = ["skills", "sessions", "typert"];

export function apply(ctx: Context): void {
  let provider: ReferenceSkillProvider | undefined;
  let providerControl: SkillProviderControl | undefined;
  const invalidateFor = (cwd: string) => void provider?.invalidateFor(cwd);

  ctx.skills.registerProvider((control: SkillProviderControl) => {
    providerControl = control;
    provider = new ReferenceSkillProvider({
      readReferences,
      resolveSourceDir,
      createInner: (sourceDirs) => makeInner(ctx, control, sourceDirs),
      watch: (cwd, onChange) => watchReferencesFile(cwd, onChange),
      logger: ctx.logger,
    });
    provider.setInvalidate(control.invalidate);
    return provider;
  });

  const listSkillsAt = async (dir: string): Promise<SkillSummaryLike[]> => {
    const inner = makeInner(ctx, providerControl!, [dir]);
    try {
      const result = await inner.list({});
      const candidates = "candidates" in result ? result.candidates : result;
      return candidates.map((candidate) => ({
        name: candidate.name,
        description: candidate.description,
        modelInvocable: candidate.invocation.modelInvocable,
      }));
    } finally {
      await inner.dispose();
    }
  };

  const inspection = new SourceInspection({
    readReferences,
    resolveSourceDir,
    listSkillsAt,
    dirExists: async (dir) => {
      try {
        return (await stat(dir)).isDirectory();
      } catch {
        return false;
      }
    },
    localSkillsDir: (cwd) => join(resolve(cwd), ".dsh", "skills"),
  });

  // 注册宿主 service（浏览器经 Typert 调用 list/replace/inspect），注入按 cwd 失效与只读巡检入口
  ctx.plugin(SkillReferenceService, {
    invalidate: invalidateFor,
    inspect: (targetPath) => inspection.inspect(targetPath),
  });

  // 发布 host face Typert 贡献，使 client 端能 $mount 同名 remote namespace
  const typert = ctx.get("typert") as TypertRegisterLike;
  typert.register(TYPERT);

  ctx.effect(function* () {
    yield async () => {
      await provider?.dispose();
    };
  }, "skill-reference dispose");
}

function makeInner(
  ctx: Context,
  control: SkillProviderControl,
  sourceDirs: string[],
): InnerProvider {
  const inner = new FileSystemSkillProvider(ctx, control, {
    providerName: `${PROVIDER_NAME}-inner`,
    includeDefaultRoots: false,
    customSkillDirs: sourceDirs,
  });
  return {
    list: (options) => inner.list(options),
    get: (candidate, options) => inner.get(candidate, options),
    dispose: () => inner.dispose(),
  };
}