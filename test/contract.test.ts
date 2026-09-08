import test from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_REFERENCE_DESCRIPTORS,
  SKILL_REFERENCE_NAMESPACE,
  SKILL_REFERENCE_SERVICE,
  referenceEntrySchema,
  skillReferenceResultSchema,
  inspectResultSchema,
} from "../src/contract.js";

test("three descriptors under skillReference namespace/service", () => {
  assert.deepEqual(SKILL_REFERENCE_DESCRIPTORS.map((d) => d.method).sort(), ["inspect", "list", "replace"]);
  for (const d of SKILL_REFERENCE_DESCRIPTORS) {
    assert.equal(d.service, SKILL_REFERENCE_SERVICE);
    assert.equal(d.namespace, SKILL_REFERENCE_NAMESPACE);
    assert.equal(d.invocation.kind, "direct");
  }
});

test("every parameter and result codec is strict with parse()", () => {
  for (const d of SKILL_REFERENCE_DESCRIPTORS) {
    for (const p of d.parameters) {
      assert.equal(p.source, "json");
      assert.equal(p.codec.mode, "strict");
      assert.equal(typeof p.codec.schema.parse, "function");
    }
    assert.equal(d.result.mode, "strict");
    assert.equal(typeof d.result.schema.parse, "function");
  }
});

test("replace descriptor carries targetPath then entries in order", () => {
  const replace = SKILL_REFERENCE_DESCRIPTORS.find((d) => d.method === "replace");
  assert.ok(replace);
  assert.deepEqual(replace.parameters.map((p) => p.wire), ["targetPath", "entries"]);
});

test("list and inspect descriptors take single targetPath param", () => {
  for (const method of ["list", "inspect"]) {
    const descriptor = SKILL_REFERENCE_DESCRIPTORS.find((d) => d.method === method);
    assert.ok(descriptor);
    assert.deepEqual(descriptor.parameters.map((p) => p.wire), ["targetPath"]);
  }
});

test("referenceEntrySchema validates shape", () => {
  assert.deepEqual(referenceEntrySchema.parse({ name: "dev", path: "D:/dev" }), { name: "dev", path: "D:/dev" });
  assert.throws(() => referenceEntrySchema.parse({ name: "", path: "x" }));
  assert.throws(() => referenceEntrySchema.parse({ name: "x" }));
});

test("skillReferenceResultSchema accepts entries plus optional error", () => {
  assert.deepEqual(skillReferenceResultSchema.parse({ entries: [] }), { entries: [] });
  assert.deepEqual(
    skillReferenceResultSchema.parse({ entries: [{ name: "a", path: "b" }], error: "boom" }),
    { entries: [{ name: "a", path: "b" }], error: "boom" },
  );
});

test("inspectResultSchema accepts entries with status enum and skills with source", () => {
  assert.deepEqual(
    inspectResultSchema.parse({
      entries: [{ name: "dev", path: "D:/dev", status: "ok" }],
      skills: [{ name: "alpha", description: "a", modelInvocable: true, source: "dev" }],
    }),
    {
      entries: [{ name: "dev", path: "D:/dev", status: "ok" }],
      skills: [{ name: "alpha", description: "a", modelInvocable: true, source: "dev" }],
    },
  );
  assert.throws(() =>
    inspectResultSchema.parse({ entries: [{ name: "dev", path: "D:/dev", status: "bogus" }], skills: [] }),
  );
  assert.throws(() =>
    inspectResultSchema.parse({ entries: [], skills: [{ name: "a", description: "", modelInvocable: true, source: "" }] }),
  );
});