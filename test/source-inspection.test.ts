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
  assert.equal(result.skills[0].enabled, true);
  assert.equal(result.skills[0].entryPath, undefined);
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
    result.skills.map((s) => ({
      name: s.name,
      source: s.source,
      enabled: s.enabled,
      entryPath: s.entryPath,
    })),
    [
      { name: "alpha", source: "dev", enabled: true, entryPath: "D:/dev" },
      { name: "beta", source: "dev", enabled: true, entryPath: "D:/dev" },
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
  assert.equal(alpha?.enabled, true);
  assert.equal(alpha?.entryPath, "D:/first");
  assert.equal(result.skills.filter((s) => s.name === "alpha").length, 1);
  const localOnly = result.skills.find((s) => s.name === "localOnly");
  assert.equal(localOnly?.source, "local");
});

test("skills outside the whitelist are listed as disabled after the enabled ones", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev", skills: ["alpha"] }],
  });
  dirs.add("D:/dev");
  perDir.set("D:/dev", [skill("alpha"), skill("beta")]);

  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, [{ name: "dev", path: "D:/dev", status: "ok" }]);
  assert.deepEqual(
    result.skills.map((s) => ({ name: s.name, enabled: s.enabled, entryPath: s.entryPath })),
    [
      { name: "alpha", enabled: true, entryPath: "D:/dev" },
      { name: "beta", enabled: false, entryPath: "D:/dev" },
    ],
  );
});

test("whitelist does not change source health", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev", skills: ["gamma"] }],
  });
  dirs.add("D:/dev");
  perDir.set("D:/dev", [skill("alpha")]);

  const result = await inspection.inspect("D:/t");
  assert.deepEqual(result.entries, [{ name: "dev", path: "D:/dev", status: "ok" }]);
});

test("disabled reference skill does not shadow the local one of the same name", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [{ name: "dev", path: "D:/dev", skills: ["other"] }],
  });
  dirs.add("D:/dev");
  perDir.set("D:/dev", [skill("alpha")]);
  perDir.set("D:/t/local", [skill("alpha")]);

  const result = await inspection.inspect("D:/t");
  assert.deepEqual(
    result.skills.map((s) => ({ name: s.name, source: s.source, enabled: s.enabled })),
    [
      { name: "alpha", source: "local", enabled: true },
      { name: "alpha", source: "dev", enabled: false },
    ],
  );
});

test("a disabled skill in the earlier source falls back to the later source", async () => {
  const { inspection, dirs, perDir } = makeInspection({
    readReferences: async () => [
      { name: "first", path: "D:/first", skills: ["other"] },
      { name: "second", path: "D:/second" },
    ],
  });
  dirs.add("D:/first");
  dirs.add("D:/second");
  perDir.set("D:/first", [skill("alpha")]);
  perDir.set("D:/second", [skill("alpha")]);

  const result = await inspection.inspect("D:/t");
  assert.deepEqual(
    result.skills.map((s) => ({ name: s.name, source: s.source, enabled: s.enabled })),
    [
      { name: "alpha", source: "second", enabled: true },
      { name: "alpha", source: "first", enabled: false },
    ],
  );
});