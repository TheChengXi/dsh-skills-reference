import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillReferenceService } from "../src/rpc.js";
import { readReferences } from "../src/references-store.js";

function makeCtx() {
  return {
    reflect: { provide() {} },
    get() {
      return undefined;
    },
  };
}

function makeInspect() {
  return async () => ({ entries: [], skills: [] });
}

test("list returns empty entries when no declaration file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-rpc-"));
  try {
    const service = new SkillReferenceService(makeCtx(), { invalidate: () => {}, inspect: makeInspect() });
    assert.deepEqual(await service.list(dir), { entries: [] });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replace writes entries and invalidates with targetPath once", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skill-ref-rpc-"));
  try {
    const invalidated: string[] = [];
    const service = new SkillReferenceService(makeCtx(), {
      invalidate: (cwd) => {
        invalidated.push(cwd);
      },
      inspect: makeInspect(),
    });
    const entries = [{ name: "dev", path: "D:/dev/skill-dev" }];
    assert.deepEqual(await service.replace(dir, entries), { entries });
    assert.deepEqual(invalidated, [dir]);
    assert.deepEqual(await readReferences(dir), entries);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("list returns error when targetPath is empty", async () => {
  const service = new SkillReferenceService(makeCtx(), { invalidate: () => {}, inspect: makeInspect() });
  assert.deepEqual(await service.list(""), {
    entries: [],
    error: "targetPath 为空",
  });
});

test("replace returns error when targetPath is empty and does not write", async () => {
  let invalidated = 0;
  const service = new SkillReferenceService(makeCtx(), {
    invalidate: () => {
      invalidated += 1;
    },
    inspect: makeInspect(),
  });
  assert.deepEqual(await service.replace("  ", [{ name: "a", path: "b" }]), {
    entries: [],
    error: "targetPath 为空",
  });
  assert.equal(invalidated, 0);
});

test("inspect delegates to injected inspection and passes targetPath", async () => {
  let received: string | undefined;
  const service = new SkillReferenceService(makeCtx(), {
    invalidate: () => {},
    inspect: async (targetPath) => {
      received = targetPath;
      return {
        entries: [{ name: "dev", path: "D:/dev", status: "ok" as const }],
        skills: [{ name: "alpha", description: "a", modelInvocable: true, source: "dev" }],
      };
    },
  });
  const result = await service.inspect("D:/t");
  assert.equal(received, "D:/t");
  assert.equal(result.entries[0].status, "ok");
  assert.equal(result.skills[0].source, "dev");
});

test("inspect returns error when inspection throws", async () => {
  const service = new SkillReferenceService(makeCtx(), {
    invalidate: () => {},
    inspect: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(await service.inspect("D:/t"), { entries: [], skills: [], error: "巡检失败: boom" });
});