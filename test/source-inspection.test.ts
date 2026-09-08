import test from "node:test";
import assert from "node:assert/strict";
import { SourceInspection, type SkillSummaryLike } from "../src/source-inspection.js";

function skill(name: string): SkillSummaryLike {
  return { name, description: `${name} desc`, modelInvocable: true };
}

 function makeInspection(overrides: Partial<ConstructorParameters<typeof SourceInspection>[0]> = {}) {
  const dirs = new Set<string>();
  const perDir = new Map<string, SkillSummaryLike[]>();
  return {
    dirs,
    perDir,
    inspection: new SourceInspection({
      readReferences: async () => [],
      resolveSourceDir: (entry) => entry.path,
      listSkillsAt: async (dir) => perDir.get(dir) ?? [],
      dirExists: async (dir) => dirs.has(dir),
      localSkillsDir: (cwd) => `${cwd}/local`,
      ...overrides,
    }),
  };
}

test("empty references returns entries=[], skills only local", async () => {
  const { inspection, perDir } = makeInspection();
  perDir.set("D:/t/local", [skill("local-skill")]);

  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, []);
  assert.deepEqual(result.skills.map((s) => s.name), ["local-skill"]);
  assert.equal(result.skills[0].source, "local");
});

test("missing source dir marks invalid and contributes no skill", async () => {
  const { inspection } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev" }],
  });
  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, [{ name: "dev", path: "D:/dev", status: "invalid" }]);
  assert.deepEqual(result.skills, []);
});

test("existing but empty source dir marks empty", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev" }],
  });
  dirs.add("D:/dev");
  perDir.set("D:/dev", []);
  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, [{ name: "dev", path: "D:/dev", status: "empty" }]);
  assert.deepEqual(result.skills, []);
});

test("healthy source contributes skills tagged with source name", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev" }],
  });
  dirs.add("D:/dev");
  perDir.set("D:/dev", [skill("alpha"), skill("beta")]);
  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, [{ name: "dev", path: "D:/dev", status: "ok" }]);
  assert.deepEqual(
    result.skills.map((s) => ({ name: s.name, source: s.source })),
    [
      { name: "alpha", source: "dev" },
      { name: "beta", source: "dev" },
    ],
  );
});

test("duplicate name: earlier source wins, local is shadowed", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [
      { name: "first", path: "D:/first" },
      { name: "second", path: "D:/second" },
    ],
  });
  dirs.add("D:/first");
  dirs.add("D:/second");
  perDir.set("D:/first", [skill("alpha")]);
  perDir.set("D:/second", [skill("alpha")]);
  perDir.set("D:/t/local", [skill("alpha"), skill("localOnly")]);

  const result = await inspection.inspect("D:/t");
  // 同名 alpha 归首个源 first；second 覆盖无效；本地 alpha 被引用源覆盖
  const alpha = result.skills.find((s) => s.name === "alpha");
  assert.equal(alpha?.source, "first");
  assert.equal(result.skills.filter((s) => s.name === "alpha").length, 1);
  const localOnly = result.skills.find((s) => s.name === "localOnly");
  assert.equal(localOnly?.source, "local");
});