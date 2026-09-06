import test from "node:test";
import assert from "node:assert/strict";
import {
  parseReferences,
  serializeReferences,
  resolveSourceDir,
  REFERENCE_SKILL_RANK,
} from "../src/schema.js";

test("REFERENCE_SKILL_RANK is less than local project-dsh rank 100", () => {
  assert.ok(REFERENCE_SKILL_RANK < 100);
});

test("parseReferences parses a valid list", () => {
  const entries = parseReferences("- name: dev\n  path: D:/dev/skill-dev\n- name: other\n  path: ~/skills\n");
  assert.deepEqual(entries, [
    { name: "dev", path: "D:/dev/skill-dev" },
    { name: "other", path: "~/skills" },
  ]);
});

test("parseReferences returns [] for empty text", () => {
  assert.deepEqual(parseReferences(""), []);
  assert.deepEqual(parseReferences("  \n  "), []);
});

test("parseReferences rejects non-array top level", () => {
  assert.throws(() => parseReferences("name: dev\npath: D:/dev\n"), /top level must be a list/);
});

test("parseReferences rejects malformed entries", () => {
  assert.throws(() => parseReferences("- name: dev\n"), /path must be a non-empty string/);
  assert.throws(() => parseReferences("- path: D:/dev\n"), /name must be a non-empty string/);
  assert.throws(() => parseReferences("- hello\n"), /must be an object/);
  assert.throws(() => parseReferences("- name: 123\n  path: D:/x\n"), /name must be a non-empty string/);
});

test("serializeReferences round-trips through parseReferences", () => {
  const entries = [
    { name: "dev", path: "D:/dev/skill-dev" },
    { name: "other", path: "~/skills" },
  ];
  assert.deepEqual(parseReferences(serializeReferences(entries)), entries);
});

test("resolveSourceDir joins .dsh/skills and normalizes", () => {
  assert.equal(resolveSourceDir({ name: "dev", path: "D:/dev/skill-dev" }), "D:\\dev\\skill-dev\\.dsh\\skills");
});

test("resolveSourceDir expands leading ~", () => {
  const result = resolveSourceDir({ name: "dev", path: "~/skills" }, "C:/Users/tester");
  assert.equal(result, "C:\\Users\\tester\\skills\\.dsh\\skills");
});