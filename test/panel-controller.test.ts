import test from "node:test";
import assert from "node:assert/strict";
import {
  SkillReferencePanelController,
  type SkillReferenceRemote,
} from "../src/client/controller.js";

/** 目标工作区不可用时的典型 remote 响应（宿主 rpc 的形状）。 */
function unavailableValue(targetPath: string) {
  return { entries: [], unavailable: true, error: `目标工作区不可用: ${targetPath} 不存在或不是目录` };
}

function makeRemote(overrides: Partial<SkillReferenceRemote>): SkillReferenceRemote {
  return {
    list: async () => ({ ok: true, value: { entries: [] } }),
    replace: async () => ({ ok: true, value: { entries: [] } }),
    inspect: async () => ({ ok: true, value: { entries: [], skills: [] } }),
    ...overrides,
  };
}

function makeController(remote: SkillReferenceRemote, cwd = "D:/target") {
  return new SkillReferencePanelController({
    remote,
    sessions: {
      list: {
        getSnapshot: () => ({ ids: ["s1"], byId: { s1: { cwd, retainedBy: { mainView: 1 } } } }),
      },
    },
    pickDirectory: async () => null,
  });
}

/** 没有任何被主视图保留的会话时的快照（0.2.0 快照语义下 targetPath 无从推导）。 */
function makeControllerWithoutMainView(remote: SkillReferenceRemote) {
  return new SkillReferencePanelController({
    remote,
    sessions: {
      list: {
        getSnapshot: () => ({
          ids: ["s1"],
          byId: { s1: { cwd: "D:/target", retainedBy: { mainView: 0 } } },
        }),
      },
    },
    pickDirectory: async () => null,
  });
}

/** open/setTargetPath 内部的 load 是 fire-and-forget，这里等它离开 loading。 */
async function settle(controller: SkillReferencePanelController): Promise<void> {
  for (let round = 0; round < 100; round += 1) {
    if (controller.getState().phase !== "loading") return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("controller 未在预期轮次内离开 loading");
}

test("list 回传 unavailable 时进入不可用态且不调用 inspect", async () => {
  let inspectCalls = 0;
  const remote = makeRemote({
    list: async (targetPath) => ({ ok: true, value: unavailableValue(targetPath) }),
    inspect: async () => {
      inspectCalls += 1;
      return { ok: true, value: { entries: [], skills: [] } };
    },
  });
  const controller = makeController(remote, "D:/missing");

  controller.open();
  await settle(controller);

  const state = controller.getState();
  assert.equal(state.unavailable, true);
  assert.equal(state.phase, "ready");
  assert.deepEqual(state.entries, []);
  assert.deepEqual(state.baseline, []);
  assert.deepEqual(state.health, []);
  assert.deepEqual(state.skills, []);
  assert.match(state.error ?? "", /目标工作区不可用/);
  assert.equal(controller.dirty, false);
  assert.equal(inspectCalls, 0);
});

test("由不可用路径切到可用路径后 unavailable 复位并载入声明与预览", async () => {
  const remote = makeRemote({
    list: async (targetPath) =>
      targetPath === "D:/missing"
        ? { ok: true, value: unavailableValue(targetPath) }
        : { ok: true, value: { entries: [{ name: "dev", path: "D:/dev" }] } },
    inspect: async () => ({
      ok: true,
      value: {
        entries: [{ name: "dev", path: "D:/dev", status: "ok" as const }],
        skills: [
          {
            name: "alpha",
            description: "a",
            modelInvocable: true,
            source: "dev",
            enabled: true,
            entryPath: "D:/dev",
          },
        ],
      },
    }),
  });
  const controller = makeController(remote, "D:/missing");

  controller.open();
  await settle(controller);
  assert.equal(controller.getState().unavailable, true);

  controller.setTargetPath("D:/target");
  await settle(controller);

  const state = controller.getState();
  assert.equal(state.unavailable, false);
  assert.deepEqual(state.entries, [{ name: "dev", path: "D:/dev" }]);
  assert.equal(state.health.length, 1);
  assert.equal(state.skills.length, 1);
  assert.equal(state.error, undefined);
});

test("声明损坏（error 非 unavailable）仍走 error 态且不标记不可用", async () => {
  const remote = makeRemote({
    list: async () => ({ ok: true, value: { entries: [], error: "解析声明失败: boom" } }),
  });
  const controller = makeController(remote);

  controller.open();
  await settle(controller);

  const state = controller.getState();
  assert.equal(state.phase, "error");
  assert.equal(state.unavailable, false);
  assert.equal(state.error, "解析声明失败: boom");
});

test("save 遇到 unavailable 时进入不可用态并丢弃编辑副本", async () => {
  const remote = makeRemote({
    list: async () => ({ ok: true, value: { entries: [] } }),
    replace: async (targetPath) => ({ ok: true, value: unavailableValue(targetPath) }),
  });
  const controller = makeController(remote);

  controller.open();
  await settle(controller);
  controller.addEntry();
  assert.equal(controller.dirty, true);

  await controller.save();

  const state = controller.getState();
  assert.equal(state.unavailable, true);
  assert.equal(state.phase, "ready");
  assert.deepEqual(state.entries, []);
  assert.deepEqual(state.baseline, []);
  assert.equal(controller.dirty, false);
  assert.match(state.error ?? "", /目标工作区不可用/);
});

test("无主视图会话时 targetPath 为 null 并提示未指定目标工作区", async () => {
  const controller = makeControllerWithoutMainView(makeRemote({}));

  controller.open();
  await settle(controller);

  const state = controller.getState();
  assert.equal(state.targetPath, null);
  assert.equal(state.phase, "ready");
  assert.equal(state.unavailable, false);
  assert.match(state.error ?? "", /未指定目标工作区/);
});
