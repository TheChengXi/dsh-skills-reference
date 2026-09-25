import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { SkillProviderControl } from "@deepseek-ai/dsh-skill";
import { FileSystemSkillProvider } from "@deepseek-ai/dsh-skill-filesystem";
import { ReferenceSkillProvider, type InnerProvider } from "../src/reference-provider.js";
import { SourceInspection, type SkillSummaryLike } from "../src/source-inspection.js";
import { readReferences, writeReferences } from "../src/references-store.js";
import { resolveSourceDir } from "../src/schema.js";

/** 官方 provider 只需 ctx.get("fs")（无 fs 服务时回落 node fs）与 control 的 signal/invalidate。 */
function makeCtx(): Context {
  return { get: () => undefined } as unknown as Context;
}

function makeControl(): SkillProviderControl {
  return { signal: new AbortController().signal, invalidate: () => {} };
}

/** 按官方目录包形状造一个 skill：<dir>/<name>/SKILL.md，frontmatter 带 name 与 description。 */
async function writeSkill(skillsDir: string, name: string, description: string): Promise<void> {
  const skillDir = join(skillsDir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody of ${name}\n`,
    "utf8",
  );
}

function makeInner(ctx: Context, control: SkillProviderControl, dir: string): InnerProvider {
  const inner = new FileSystemSkillProvider(ctx, control, {
    providerName: "skill-reference-inner",
    includeDefaultRoots: false,
    customSkillDirs: [dir],
    watch: false,
  });
  return {
    list: (options) => inner.list(options),
    get: (candidate, options) => inner.get(candidate, options),
    dispose: () => inner.dispose(),
  };
}

function makeInspection(ctx: Context, control: SkillProviderControl): SourceInspection {
  return new SourceInspection({
    readReferences,
    resolveSourceDir,
    listSkillsAt: async (dir): Promise<SkillSummaryLike[]> => {
      const inner = makeInner(ctx, control, dir);
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
    },
    dirExists: async (dir) => {
      try {
        return (await stat(dir)).isDirectory();
      } catch {
        return false;
      }
    },
    localSkillsDir: (cwd) => join(cwd, ".dsh", "skills"),
  });
}

test("real filesystem: whitelist filters the catalog, get loads the body, inspect marks the disabled skill", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-ref-enablement-"));
  const source = join(root, "source");
  const target = join(root, "target");
  const ctx = makeCtx();
  const control = makeControl();
  try {
    await writeSkill(join(source, ".dsh", "skills"), "alpha", "alpha skill");
    await writeSkill(join(source, ".dsh", "skills"), "beta", "beta skill");
    await writeReferences(target, [{ name: "src", path: source, skills: ["alpha"] }]);

    const provider = new ReferenceSkillProvider({
      readReferences,
      resolveSourceDir,
      createInner: (sourceDir) => makeInner(ctx, control, sourceDir),
    });

    // 真实生效侧：白名单外的 beta 不进入 catalog，alpha 被 restamp 为引用源身份
    const candidates = await provider.list({ cwd: target });
    assert.ok(Array.isArray(candidates));
    assert.deepEqual(candidates.map((candidate) => candidate.name), ["alpha"]);
    assert.equal(candidates[0].rank, 1);
    assert.equal(candidates[0].provider, "skill-reference");

    // get 经 owner 委派回该源的内层实例，能读到真实正文
    const definition = await provider.get(candidates[0], { cwd: target });
    assert.equal(definition?.provider, "skill-reference");
    assert.match(definition?.content ?? "", /body of alpha/);

    // 面板侧：同一份白名单下 beta 作为停用项出现且带条目路径，alpha 生效
    const inspection = makeInspection(ctx, control);
    const inspected = await inspection.inspect(target);
    assert.deepEqual(inspected.entries, [{ name: "src", path: source, status: "ok" }]);
    assert.deepEqual(
      inspected.skills.map((skill) => ({
        name: skill.name,
        enabled: skill.enabled,
        entryPath: skill.entryPath,
      })),
      [
        { name: "alpha", enabled: true, entryPath: source },
        { name: "beta", enabled: false, entryPath: source },
      ],
    );

    // 重新声明为全量生效后 beta 回归（白名单变化只刷新过滤快照）
    await writeReferences(target, [{ name: "src", path: source }]);
    const all = await provider.list({ cwd: target });
    assert.ok(Array.isArray(all));
    assert.deepEqual(all.map((candidate) => candidate.name), ["alpha", "beta"]);

    await provider.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real filesystem: a disabled source skill lets the local skill of the same name take effect", async () => {
  const root = await mkdtemp(join(tmpdir(), "skill-ref-enablement-"));
  const source = join(root, "source");
  const target = join(root, "target");
  const ctx = makeCtx();
  const control = makeControl();
  try {
    await writeSkill(join(source, ".dsh", "skills"), "alpha", "alpha from source");
    await writeSkill(join(target, ".dsh", "skills"), "alpha", "alpha from local");
    await writeReferences(target, [{ name: "src", path: source, skills: [] }]);

    const provider = new ReferenceSkillProvider({
      readReferences,
      resolveSourceDir,
      createInner: (sourceDir) => makeInner(ctx, control, sourceDir),
    });
    // skills: [] 与缺省同义 → 引用源照常生效
    const enabled = await provider.list({ cwd: target });
    assert.ok(Array.isArray(enabled));
    assert.deepEqual(enabled.map((candidate) => candidate.name), ["alpha"]);

    // 停用引用源的 alpha 后，该源不再提供它（本地同名因此可回退——此处仅验证源侧不再贡献）
    await writeReferences(target, [{ name: "src", path: source, skills: ["other"] }]);
    assert.deepEqual(await provider.list({ cwd: target }), []);
    await provider.dispose();

    // 面板侧：本地 alpha 生效，引用源 alpha 作为停用项保留可见
    const inspected = await makeInspection(ctx, control).inspect(target);
    assert.deepEqual(
      inspected.skills.map((skill) => ({
        name: skill.name,
        source: skill.source,
        enabled: skill.enabled,
      })),
      [
        { name: "alpha", source: "local", enabled: true },
        { name: "alpha", source: "src", enabled: false },
      ],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});