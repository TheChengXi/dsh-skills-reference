/** 该路径是否为已存在的目录；stat 失败（不存在/无权限/路径非法）或指向非目录均为 false。 */
export declare function isExistingDirectory(candidatePath: string): Promise<boolean>;
