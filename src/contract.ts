/**
 * @intent
 * Typert RPC 契约：定义 skillReference wire 命名空间的 RPC 方法（list / replace / inspect）与它们的 strict 描述符，
 * 供 host 端（ctx.typert.register 的 invocations）与 client 端（ctx.remote.$mount 的 descriptors）共享同一份描述符，
 * 保证两端参数/结果编解码一致。
 *
 * 边界：list/replace/inspect 统一以显式 targetPath（目标工作区根路径）定位，不依赖 sessionId；inspect 返回
 * 逐源健康度（status: ok/empty/invalid）与逐 skill 来源标注（source: 本地或某引用源名）；业务错误（声明损坏、
 * 目标路径缺失）走 error 字段而非 throw。
 *
 * 验收条件：
 * - SKILL_REFERENCE_DESCRIPTORS 含 list、replace、inspect 三个 descriptor，且 service/namespace 均为 "skillReference"
 * - 每个 descriptor 的参数与 result 均为 strict codec，schema.parse 是函数（满足 registry validateInvocation）
 * - list/replace/inspect 首参数均为 targetPath；replace 第二参为 entries
 * - inspectResultSchema 含 entries（status 枚举）与 skills（source 非空）
 */
import { z } from "zod";

/** 手写 Typert 类型（从官方定义裁剪，保留运行时结构字段，不依赖 dsh-typert-protocol 包）。 */
export interface TypertCodecStrict {
  mode: "strict";
  typeSymbol: string;
  schema: z.ZodType;
}

export interface InvocationParameterDescriptor {
  name: string;
  wire: string;
  source: "json" | "lookup";
  lookup?: string;
  codec: TypertCodecStrict;
}

export interface InvocationDescriptor {
  id: string;
  service: string;
  namespace: string;
  method: string;
  invocation: { kind: "direct" };
  parameters: InvocationParameterDescriptor[];
  result: TypertCodecStrict;
}

/** wire namespace 与 host service key（与包名 "dsh-skills-reference" 刻意区分）。 */
export const SKILL_REFERENCE_NAMESPACE = "skillReference";
export const SKILL_REFERENCE_SERVICE = "skillReference";

/** 单条引用声明的 wire 形状：{ name, path }（与 schema.ts 的 ReferenceEntry 一一对应）。 */
export const referenceEntrySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
});

/** list / replace 的统一返回：声明条目 + 可选的业务错误描述。 */
export const skillReferenceResultSchema = z.object({
  entries: z.array(referenceEntrySchema),
  error: z.string().optional(),
});

export type SkillReferenceResultWire = z.infer<typeof skillReferenceResultSchema>;

/** 单条引用源的逐源健康度：源目录存在且发现 skill=ok；存在但无 skill=empty；不存在/不可读=invalid。 */
export const inspectEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  status: z.enum(["ok", "empty", "invalid"]),
});

/** 聚合后的单个生效 skill，source = "local" 或某个引用源展示名（均非空）。 */
export const inspectSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  modelInvocable: z.boolean(),
  source: z.string().min(1),
});

/** inspect 的统一返回：逐源健康度 + 带来源的聚合 skill + 可选的业务错误描述。 */
export const inspectResultSchema = z.object({
  entries: z.array(inspectEntrySchema),
  skills: z.array(inspectSkillSchema),
  error: z.string().optional(),
});

export type InspectResultWire = z.infer<typeof inspectResultSchema>;

const targetPathSchema = z.string().min(1);

function strict(typeSymbol: string, schema: z.ZodType): TypertCodecStrict {
  return { mode: "strict", typeSymbol, schema };
}

const targetPathParam = (): InvocationParameterDescriptor => ({
  name: "targetPath",
  wire: "targetPath",
  source: "json",
  codec: strict("dsh-skills-reference#TargetPath", targetPathSchema),
});

/** 浏览器可调用的三个 RPC 方法的描述符，host / client 两端共用。 */
export const SKILL_REFERENCE_DESCRIPTORS: InvocationDescriptor[] = [
  {
    id: "dsh-skills-reference#skillReference/list",
    service: SKILL_REFERENCE_SERVICE,
    namespace: SKILL_REFERENCE_NAMESPACE,
    method: "list",
    invocation: { kind: "direct" },
    parameters: [targetPathParam()],
    result: strict("dsh-skills-reference#SkillReferenceResult", skillReferenceResultSchema),
  },
  {
    id: "dsh-skills-reference#skillReference/replace",
    service: SKILL_REFERENCE_SERVICE,
    namespace: SKILL_REFERENCE_NAMESPACE,
    method: "replace",
    invocation: { kind: "direct" },
    parameters: [
      targetPathParam(),
      {
        name: "entries",
        wire: "entries",
        source: "json",
        codec: strict("dsh-skills-reference#ReferenceEntry[]", z.array(referenceEntrySchema)),
      },
    ],
    result: strict("dsh-skills-reference#SkillReferenceResult", skillReferenceResultSchema),
  },
  {
    id: "dsh-skills-reference#skillReference/inspect",
    service: SKILL_REFERENCE_SERVICE,
    namespace: SKILL_REFERENCE_NAMESPACE,
    method: "inspect",
    invocation: { kind: "direct" },
    parameters: [targetPathParam()],
    result: strict("dsh-skills-reference#InspectResult", inspectResultSchema),
  },
];