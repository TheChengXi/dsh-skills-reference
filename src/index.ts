/**
 * @intent
 * cordis 插件装配入口：组装 schema / references-store / reference-provider / rpc / typert-host——注册 "skill-reference"
 * provider 到 ctx.skills（复用官方 FileSystemSkillProvider 发现引用源），注册 SkillReferenceService 并发布 TYPERT
 * 到 ctx.typert（使浏览器可调 list/replace 读写声明），effect 卸载时回收内层实例与声明监测（reference-watch）。
 *
 * 边界：inject ['skills','sessions','typert']；内层官方实例 includeDefaultRoots:false 隔离自身根；声明文件是宿主配置，直接走 node fs；
 * 声明变化经 reference-watch 目录级可靠监测触发失效（覆盖删除/重建/原子替换，不用 fs.watchFile 单文件轮询）；
 * 写声明（replace）成功后在服务内部回调 invalidate，经 provider.invalidate 即时触发 catalog 重发现，无需重启。
 *
 * 验收条件：
 * - apply 后 ctx.skills.registerProvider 被调用一次且 provider 名为 "skill-reference"
 * - ctx.plugin 注册 SkillReferenceService（key "skillReference"），ctx.typert.register 注册 TYPERT（含 list/replace 两个 invocation）
 * - provider 释放走 ReferenceSkillProvider.dispose 回收资源
 * - 声明监测由 reference-watch 装配，非 fs.watchFile 单文件轮询
 */
import type { Context } from "@deepseek-ai/cordis";
import { FileSystemSkillProvider } from "@deepseek-ai/dsh-skill-filesystem";
import type { SkillProviderControl } from "@deepseek-ai/dsh-skill";
import { readReferences } from "./references-store.js";
import { watchReferencesFile } from "./reference-watch.js";
import { resolveSourceDir } from "./schema.js";
import {
  PROVIDER_NAME,
  ReferenceSkillProvider,
  type InnerProvider,
} from "./reference-provider.js";
import { SkillReferenceService } from "./rpc.js";
import { TYPERT } from "./typert-host.js";

interface TypertRegisterLike {
  register(contribution: unknown): unknown;
}

export const name = "skill-reference";
export const inject = ["skills", "sessions", "typert"];

export function apply(ctx: Context): void {
  let provider: ReferenceSkillProvider | undefined;
  const invalidate = () => provider?.invalidate();

  ctx.skills.registerProvider((control: SkillProviderControl) => {
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

  // 注册宿主 service（浏览器经 Typert 调用 list/replace），并把 provider 失效闭包注入其中
  ctx.plugin(SkillReferenceService, { invalidate });

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