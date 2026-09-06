/**
 * @intent
 * client 端 Typert remote 贡献（TYPERT_REMOTE）：把 contract 的 descriptors 包成 TypertRemoteContribution
 * （{ package, descriptors }），供 client.ts 调 ctx.remote.$mount 安装 `ctx.remote.skillReference.*`。
 *
 * 边界：只复用 contract 的同一份 descriptors，不重复声明；package 与 host TYPERT 一致。
 *
 * 验收条件：
 * - TYPERT_REMOTE.package === "dsh-skills-reference"
 * - TYPERT_REMOTE.descriptors 与 SKILL_REFERENCE_DESCRIPTORS 为同一引用
 */
import { SKILL_REFERENCE_DESCRIPTORS } from "../contract";

export const TYPERT_REMOTE = {
  package: "dsh-skills-reference",
  descriptors: SKILL_REFERENCE_DESCRIPTORS,
};