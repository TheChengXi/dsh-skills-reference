import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReferences, writeReferences, resolveReferencesFile } from "../src/references-store.js";

test("resolveReferencesFile places declaration under .dsh", () => {
  const { filePath, projectRoot } = resolveReferencesFile("D:/w");
  assert.equal(filePath, "D:\\w\\.dsh\\skill-references.yml");
  assert.equal(projectRoot, "D:\\w");
});

test("readReferences returns [] when the file is absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-"));
  try {
    assert.deepEqual(await readReferences(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("writeReferences then readReferences round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-"));
  try {
    const entries = [{ name: "dev", path: "D:/dev/skill-dev" }];
    await writeReferences(dir, entries);
    const { filePath } = resolveReferencesFile(dir);
    const raw = await readFile(filePath, "utf8");
    assert.match(raw, /name: dev/);
    assert.deepEqual(await readReferences(dir), entries);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("readReferences throws on malformed yaml", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-"));
  try {
    const { filePath } = resolveReferencesFile(dir);
    const parent = join(dir, ".dsh");
    await (await import("node:fs/promises")).mkdir(parent, { recursive: true });
    await writeFile(filePath, "name: not-a-list\n", "utf8");
    await assert.rejects(() => readReferences(dir), /top level must be a list/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});