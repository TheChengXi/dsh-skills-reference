import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillReferenceService } from "../src/rpc.js";
import { readReferences } from "../src/references-store.js";

function makeCtx(cwd: string | undefined) {
  return {
    reflect: { provide() {} },
    get(name: string) {
      if (name === "sessions") {
        return { get: () => (cwd === undefined ? undefined : { header: { cwd } }) };
      }
      return undefined;
    },
  };
}

test("list returns empty entries when no declaration file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-rpc-"));
  try {
    const service = new SkillReferenceService(makeCtx(dir), { invalidate: () => {} });
    assert.deepEqual(await service.list("s1"), { entries: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replace writes entries and fires invalidate once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-rpc-"));
  try {
    let invalidations = 0;
    const service = new SkillReferenceService(makeCtx(dir), { invalidate: () => { invalidations += 1; } });
    const entries = [{ name: "dev", path: "D:/dev/skill-dev" }];
    assert.deepEqual(await service.replace("s1", entries), { entries });
    assert.equal(invalidations, 1);
    assert.deepEqual(await readReferences(dir), entries);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("list returns error when session is absent", async () => {
  const service = new SkillReferenceService(makeCtx(undefined), { invalidate: () => {} });
  assert.deepEqual(await service.list("gone"), {
    entries: [],
    error: "session not found: gone",
  });
});

test("list returns error when session has no cwd", async () => {
  const ctx = {
    reflect: { provide() {} },
    get(name: string) {
      if (name === "sessions") return { get: () => ({ header: {} }) };
      return undefined;
    },
  };
  const service = new SkillReferenceService(ctx, { invalidate: () => {} });
  assert.deepEqual(await service.list("s1"), {
    entries: [],
    error: "session has no project cwd: s1",
  });
});