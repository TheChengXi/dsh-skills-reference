import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExistingDirectory } from "../src/fs-directory.js";

test("isExistingDirectory returns true for an existing directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-dir-"));
  try {
    assert.equal(await isExistingDirectory(dir), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isExistingDirectory returns false for a missing path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-dir-"));
  try {
    assert.equal(await isExistingDirectory(join(dir, "missing")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("isExistingDirectory returns false for an existing file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-dir-"));
  try {
    const file = join(dir, "not-a-dir.txt");
    await writeFile(file, "x", "utf8");
    assert.equal(await isExistingDirectory(file), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
