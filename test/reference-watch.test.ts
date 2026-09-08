import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchReferencesFile } from "../src/reference-watch.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for watch event");
    await sleep(30);
  }
}

test("fires onChange when the declaration file changes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ref-watch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".dsh"), { recursive: true });
  const file = join(root, ".dsh", "skill-references.yml");
  await writeFile(file, "- name: a\n  path: D:/a\n", "utf8");

  let hits = 0;
  const stop = watchReferencesFile(root, () => {
    hits += 1;
  });
  t.after(() => stop());
  await sleep(200);

  await writeFile(file, "- name: b\n  path: D:/b\n", "utf8");
  await waitFor(() => hits >= 1);
  assert.ok(hits >= 1);
});

test("fires onChange when the declaration file is removed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ref-watch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".dsh"), { recursive: true });
  const file = join(root, ".dsh", "skill-references.yml");
  await writeFile(file, "- name: a\n  path: D:/a\n", "utf8");

  let hits = 0;
  const stop = watchReferencesFile(root, () => {
    hits += 1;
  });
  t.after(() => stop());
  await sleep(200);

  await rm(file);
  await waitFor(() => hits >= 1);
  assert.ok(hits >= 1);
});

test("fires onChange when the .dsh dir is created and the declaration follows", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ref-watch-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  let hits = 0;
  const stop = watchReferencesFile(root, () => {
    hits += 1;
  });
  t.after(() => stop());
  await sleep(200);

  // `.dsh/` 尚不存在（祖先监听应捕获其创建）
  await mkdir(join(root, ".dsh"));
  await waitFor(() => hits >= 1);

  const beforeFile = hits;
  await writeFile(join(root, ".dsh", "skill-references.yml"), "- name: a\n  path: D:/a\n", "utf8");
  await waitFor(() => hits > beforeFile);
  assert.ok(hits > beforeFile);
});