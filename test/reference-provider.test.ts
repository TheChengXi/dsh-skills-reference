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
  const createdFor: string[] = [];
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "dev", path: "D:/dev/a" }],
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: (sourceDir) => {
      createdFor.push(sourceDir);
      return inner({ list: async () => [candidate()] });
    },
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(result));
  assert.equal(result[0].rank, REFERENCE_SKILL_RANK);
  assert.equal(result[0].provider, "skill-reference");
  assert.deepEqual(createdFor, ["D:/dev/a/.dsh/skills"]);
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
    createInner: (sourceDir) => {
      createdDirs.push([sourceDir]);
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
    createInner: (sourceDir) => {
      builtFor.push(sourceDir);
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

test("invalidateFor releases only that cwd and invalidates once", async () => {
  let created = 0;
  let disposed = 0;
  let invalidated = 0;
  const provider = new ReferenceSkillProvider({
    readReferences: async (cwd: string) => (cwd.includes("B") ? [] : [{ name: "x", path: "D:/s" }]),
    resolveSourceDir: (entry) => `${entry.path}/.dsh/skills`,
    createInner: () => {
      created++;
      return inner({
        dispose: async () => {
          disposed++;
        },
      });
    },
  });
  provider.setInvalidate(() => {
    invalidated++;
  });

  await provider.list({ cwd: "D:/roots/A" });
  await provider.list({ cwd: "D:/roots/B" });
  assert.equal(created, 1);

  await provider.invalidateFor("D:/roots/A");
  assert.equal(disposed, 1);
  assert.equal(invalidated, 1);

  await provider.list({ cwd: "D:/roots/A" });
  assert.equal(created, 2);
});

test("skills whitelist filters out candidates of that source", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "dev", path: "D:/a", skills: ["alpha"] }],
    resolveSourceDir: (entry) => entry.path,
    createInner: () =>
      inner({ list: async () => [candidate({ name: "alpha" }), candidate({ name: "beta" })] }),
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(result));
  assert.deepEqual(result.map((item) => item.name), ["alpha"]);
});

test("sources merge in declaration order and the earlier source wins a duplicate", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [
      { name: "first", path: "D:/first" },
      { name: "second", path: "D:/second" },
    ],
    resolveSourceDir: (entry) => entry.path,
    createInner: (sourceDir) =>
      inner({
        list: async () => [candidate({ name: "dup", locator: { path: `${sourceDir}/dup` } })],
      }),
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].locator, { path: "D:/first/dup" });
});

test("a skill disabled in the earlier source falls back to the later source", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [
      { name: "first", path: "D:/first", skills: ["other"] },
      { name: "second", path: "D:/second" },
    ],
    resolveSourceDir: (entry) => entry.path,
    createInner: (sourceDir) =>
      inner({
        list: async () => [candidate({ name: "dup", locator: { path: `${sourceDir}/dup` } })],
      }),
  });
  const result = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].locator, { path: "D:/second/dup" });
});

test("disabling every skill of the only source yields an empty catalog", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "dev", path: "D:/a", skills: ["gamma"] }],
    resolveSourceDir: (entry) => entry.path,
    createInner: () => inner({ list: async () => [candidate({ name: "alpha" })] }),
  });
  assert.deepEqual(await provider.list({ cwd: "D:/w" }), []);
});

test("get delegates to the inner that produced the candidate and restamps provider", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [{ name: "dev", path: "D:/a" }],
    resolveSourceDir: (entry) => entry.path,
    createInner: () =>
      inner({
        list: async () => [candidate({ name: "alpha" })],
        get: async () => ({
          name: "alpha",
          description: "alpha skill",
          invocation: { modelInvocable: true, userInvocable: true },
          source: "custom",
          provider: "skill-reference-inner",
          content: "alpha body",
        }),
      }),
  });
  const listed = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(listed));
  const definition = await provider.get(listed[0], { cwd: "D:/w" });
  assert.equal(definition?.provider, "skill-reference");
  assert.equal(definition?.content, "alpha body");
});

test("get returns undefined for a candidate list never produced", async () => {
  const provider = new ReferenceSkillProvider({
    readReferences: async () => [],
    resolveSourceDir: (entry) => entry.path,
    createInner: () => inner(),
  });
  assert.equal(await provider.get(candidate(), { cwd: "D:/w" }), undefined);
});

test("whitelist-only change reuses the inner instance and filters immediately", async () => {
  let created = 0;
  let disposed = 0;
  let readCount = 0;
  const provider = new ReferenceSkillProvider({
    readReferences: async () => {
      readCount++;
      return readCount === 1
        ? [{ name: "dev", path: "D:/a" }]
        : [{ name: "dev", path: "D:/a", skills: ["alpha"] }];
    },
    resolveSourceDir: (entry) => entry.path,
    createInner: () => {
      created++;
      return inner({
        list: async () => [candidate({ name: "alpha" }), candidate({ name: "beta" })],
        dispose: async () => void disposed++,
      });
    },
  });

  const before = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(before));
  assert.deepEqual(before.map((item) => item.name), ["alpha", "beta"]);

  const after = await provider.list({ cwd: "D:/w" });
  assert.ok(Array.isArray(after));
  assert.deepEqual(after.map((item) => item.name), ["alpha"]);
  assert.equal(created, 1);
  assert.equal(disposed, 0);
});