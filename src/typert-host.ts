/**
 * @intent
 * 宿主端 Typert 贡献（TYPERT manifest）：把 contract 的描述符包成 host face 的 TypertContribution，
 * 供 index.ts 调 ctx.typert.register 注册，从而使 client 端能 $mount 同名 remote namespace。
 *
 * 边界：schemas 留空（schema 已内联在 descriptor codec 上，与官方 dsh-goal 一致）；model 只给最小
 * reflection 元数据（一个 service、两个 method 成员），registry validatePackage 不深校验 model 内容；
 * package 用本包名，face 固定 host。
 *
 * 验收条件：
 * - TYPERT.invocations 与 SKILL_REFERENCE_DESCRIPTORS 为同一引用
 * - TYPERT.package === "dsh-skills-reference"、face === "host"、schemas 为空数组
 */
import { SKILL_REFERENCE_DESCRIPTORS } from "./contract.js";

/** 手写 TypertContribution 运行时形状（registry register 会校验 face/package 唯一、invocations 结构）。 */
export interface TypertContributionLike {
  package: string;
  face: "host" | "client";
  schemas: unknown[];
  model: {
    services: Array<{
      key: string;
      exportName: string;
      members: Array<{ kind: string; name: string; signature: string }>;
      types: unknown[];
    }>;
    events: unknown[];
    objects: unknown[];
  };
  invocations: unknown[];
}

export const TYPERT: TypertContributionLike = {
  package: "dsh-skills-reference",
  face: "host",
  schemas: [],
  model: {
    services: [
      {
        key: "skillReference",
        exportName: "SkillReferenceService",
        members: [
          {
            kind: "method",
            name: "list",
            signature: "list(sessionId: string): Promise<SkillReferenceResult>",
          },
          {
            kind: "method",
            name: "replace",
            signature: "replace(sessionId: string, entries: ReferenceEntry[]): Promise<SkillReferenceResult>",
          },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: SKILL_REFERENCE_DESCRIPTORS,
};