/**
 * @intent
 * Typert RPC 契约：定义 skillReference wire 命名空间的 RPC 方法（list / replace）与它们的 strict 描述符，
 * 供 host 端（ctx.typert.register 的 invocations）与 client 端（ctx.remote.$mount 的 descriptors）共享同一份描述符，
 * 保证两端参数/结果编解码一致。
 *
 * 边界：此处手写类型与 zod schema，不引入 dsh-typert-* 运行时依赖；所有方法只用 json 参数、无 scope/lookup/cancellation；
 * 结果统一为 { entries, error? }，业务错误（声明损坏、会话缺失）走 error 字段而非 throw。
 *
 * 验收条件：
 * - SKILL_REFERENCE_DESCRIPTORS 含 list 与 replace 两个 descriptor，且 service/namespace 均为 "skillReference"
 * - 每个 descriptor 的参数与 result 均为 strict codec，schema.parse 是函数（满足 registry validateInvocation）
 * - referenceEntrySchema 只接受 { name: 非空, path: 非空 }
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

const sessionIdSchema = z.string().min(1);

function strict(typeSymbol: string, schema: z.ZodType): TypertCodecStrict {
  return { mode: "strict", typeSymbol, schema };
}

const sessionIdParam = (): InvocationParameterDescriptor => ({
  name: "sessionId",
  wire: "sessionId",
  source: "json",
  codec: strict("@deepseek-ai/dsh-session/types#SessionId", sessionIdSchema),
});

/** 浏览器可调用的两个 RPC 方法的描述符，host / client 两端共用。 */
export const SKILL_REFERENCE_DESCRIPTORS: InvocationDescriptor[] = [
  {
    id: "dsh-skills-reference#skillReference/list",
    service: SKILL_REFERENCE_SERVICE,
    namespace: SKILL_REFERENCE_NAMESPACE,
    method: "list",
    invocation: { kind: "direct" },
    parameters: [sessionIdParam()],
    result: strict("dsh-skills-reference#SkillReferenceResult", skillReferenceResultSchema),
  },
  {
    id: "dsh-skills-reference#skillReference/replace",
    service: SKILL_REFERENCE_SERVICE,
    namespace: SKILL_REFERENCE_NAMESPACE,
    method: "replace",
    invocation: { kind: "direct" },
    parameters: [
      sessionIdParam(),
      {
        name: "entries",
        wire: "entries",
        source: "json",
        codec: strict("dsh-skills-reference#ReferenceEntry[]", z.array(referenceEntrySchema)),
      },
    ],
    result: strict("dsh-skills-reference#SkillReferenceResult", skillReferenceResultSchema),
  },
];