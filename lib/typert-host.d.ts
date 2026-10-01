/** 手写 TypertContribution 运行时形状（registry register 会校验 face/package 唯一、invocations 结构）。 */
export interface TypertContributionLike {
    package: string;
    face: "host" | "client";
    schemas: unknown[];
    model: {
        services: Array<{
            key: string;
            exportName: string;
            members: Array<{
                kind: string;
                name: string;
                signature: string;
            }>;
            types: unknown[];
        }>;
        events: unknown[];
        objects: unknown[];
    };
    invocations: unknown[];
}
export declare const TYPERT: TypertContributionLike;
