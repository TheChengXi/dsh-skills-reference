export type Watch = (cwd: string, onChange: () => void) => () => void;
export declare const watchReferencesFile: Watch;
