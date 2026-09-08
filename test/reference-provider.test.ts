import test from "node:test";
import assert from "node:assert/strict";
import type { SkillCandidate } from "@deepseek-ai/dsh-skill";
import { REFERENCE_SKILL_RANK } from "../src/schema.js";
import { ReferenceSkillProvider, restamp, type InnerProvider } from "../src/reference-provider.js";

function candidate(partial: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    name: "alpha",
    description: "alpha skill",
    invocation: { modelInvocable: true, userInvocable: true },
    source: "custom",
    provider: "skill-reference-inner",
    rank: 300,
    locator: { path: "/src/alpha" },
    ...partial,
  };
}

function inner(fields: Partial<InnerProvider> = {}): InnerProvider {
  return {
    list: async () => [],
    get: async () => undefined,
    dispose: async () => {},
    ...fields,
  };
}

test("restamp rewrites rank and provider", () => {
  const result = restamp(candidate());
  assert.equal(result.rank, REFERENCE_SKILL_RANK);
  assert.equal(result.provider, "skill-reference");
  assert.equal(result.name, "alpha");
});

test("empty references returns empty list without creating an inner", async () => {
  let created = 0;
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [],
    resolveSourceDir: (entry) => entry.path,
    createInner: () => {
      created++;
      return inner();
    },
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.deepEqual(result, []);
  assert.equal(created, 0);
});

test("list routes cwd to inner and restamps candidates", async () => {
  let lastSourceDirs: string[] = [];
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "dev", path: "D:/dev/a" }],
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: (sourceDirs) => {
      lastSourceDirs = sourceDirs;
      return inner({ list: async () => [candidate()] });
    },
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(result));
  assert.equal(result[0].rank, REFERENCE_SKILL_RANK);
  assert.equal(result[0].provider, "skill-reference");
  assert.deepEqual(lastSourceDirs, ["D:/dev/a/.dsh/skills"]);
});

test("reference change rebuilds inner and invalidates", async () => {
  const createdDirs: string[][] = [];
  let readCount = 0;
  let disposed = 0;
  let invalidated = 0;
  let onChange: (() => void) | undefined;

  const provider = new ReferenceSkillProvider({
    readReferences: async () => {
      readCount++;
      return readCount === 1 ? [{ name: "a", path: "D:/a" }] : [{ name: "b", path: "D:/b" }];
    },
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: (sourceDirs) => {
      createdDirs.push(sourceDirs);
      return inner({ dispose: async () => void disposed++ });
    },
    watch: (_cwd, cb) => {
      onChange = cb;
      return () => {
        onChange = undefined;
      };
    },
  });
  provider.setInvalidate(() => void invalidated++);

  await provider.list({ cwd: "D:/w" });
  assert.equal(createdDirs.length, 1);
  assert.deepEqual(createdDirs[0], ["D:/a/.dsh/skills"]);

  onChange?.();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(disposed, 1);
  assert.equal(invalidated, 1);

  await provider.list({ cwd: "D:/w" });
  assert.equal(createdDirs.length, 2);
  assert.deepEqual(createdDirs[1], ["D:/b/.dsh/skills"]);
});

test("dispose releases inners and watchers", async () => {
  let disposed = 0;
  let unwatched = 0;
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "a", path: "D:/a" }],
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: () => inner({ dispose: async () => void disposed++ }),
    watch: () => () => void unwatched++,
  });
  await provider.list({ cwd: "D:/w" });
  await provider.dispose();
  assert.equal(disposed, 1);
  assert.equal(unwatched, 1);
});

test("reference source is scoped per cwd and does not leak across workspaces", async () => {
  const builtFor: string[] = [];
  const provider = new ReferenceSkillProvider({
    readReferences: async (cwd: string) =>
      cwd.includes("B") ? [{ name: "dev", path: "D:/a" }] : [],
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: (sourceDirs) => {
      builtFor.push(sourceDirs[0]);
      return inner({ list: async () => [candidate()] });
    },
  });

  // B 声明了引用源 → 发现 alpha
  const inB = await provider.list({ cwd: "D:/roots/B" });
  assert.equal(inB.length, 1);
  assert.equal(inB[0].name, "alpha");
  assert.deepEqual(builtFor, ["D:/a/.dsh/skills"]);

  // C 无声明 → 返回空，且不新建内层实例（不泄露 B 的引用源）
  const inC = await provider.list({ cwd: "D:/roots/C" });
  assert.deepEqual(inC, []);
  assert.equal(builtFor.length, 1);

  // 回切 B → 引用源的 skill 重新可见
  const backInB = await provider.list({ cwd: "D:/roots/B" });
  assert.equal(backInB.length, 1);
});