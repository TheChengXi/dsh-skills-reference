import { FileSystemSkillProvider } from "@deepseek-ai/dsh-skill-filesystem";
import { join, resolve } from "node:path";
import { isExistingDirectory } from "./fs-directory.js";
import { readReferences } from "./references-store.js";
import { watchReferencesFile } from "./reference-watch.js";
import { resolveSourceDir } from "./schema.js";
import { PROVIDER_NAME, ReferenceSkillProvider, } from "./reference-provider.js";
import { SourceInspection } from "./source-inspection.js";
import { SkillReferenceService } from "./rpc.js";
import { TYPERT } from "./typert-host.js";
export const name = "skill-reference";
export const inject = ["skills", "sessions", "typert"];
export function apply(ctx) {
    let provider;
    let providerControl;
    const invalidateFor = (cwd) => void provider?.invalidateFor(cwd);
    ctx.skills.registerProvider((control) => {
        providerControl = control;
        provider = new ReferenceSkillProvider({
            readReferences,
            resolveSourceDir,
            createInner: (sourceDir) => makeInner(ctx, control, sourceDir),
            watch: (cwd, onChange) => watchReferencesFile(cwd, onChange),
            logger: ctx.logger,
        });
        provider.setInvalidate(control.invalidate);
        return provider;
    });
    const listSkillsAt = async (dir) => {
        const inner = makeInner(ctx, providerControl, dir);
        try {
            const result = await inner.list({});
            const candidates = "candidates" in result ? result.candidates : result;
            return candidates.map((candidate) => ({
                name: candidate.name,
                description: candidate.description,
                modelInvocable: candidate.invocation.modelInvocable,
            }));
        }
        finally {
            await inner.dispose();
        }
    };
    const inspection = new SourceInspection({
        readReferences,
        resolveSourceDir,
        listSkillsAt,
        dirExists: isExistingDirectory,
        localSkillsDir: (cwd) => join(resolve(cwd), ".dsh", "skills"),
    });
    // 注册宿主 service（浏览器经 Typert 调用 list/replace/inspect），注入按 cwd 失效与只读巡检入口
    ctx.plugin(SkillReferenceService, {
        invalidate: invalidateFor,
        inspect: (targetPath) => inspection.inspect(targetPath),
    });
    // 发布 host face Typert 贡献，使 client 端能 $mount 同名 remote namespace
    const typert = ctx.get("typert");
    typert.register(TYPERT);
    ctx.effect(function* () {
        yield async () => {
            await provider?.dispose();
        };
    }, "skill-reference dispose");
}
/** 构造只管一个源目录的官方内层实例：reference-provider 每源一个、source-inspection 每目录一个，均由同一 ctx/control 产出。 */
function makeInner(ctx, control, sourceDir) {
    const inner = new FileSystemSkillProvider(ctx, control, {
        providerName: `${PROVIDER_NAME}-inner`,
        includeDefaultRoots: false,
        customSkillDirs: [sourceDir],
    });
    return {
        list: (options) => inner.list(options),
        get: (candidate, options) => inner.get(candidate, options),
        dispose: () => inner.dispose(),
    };
}
