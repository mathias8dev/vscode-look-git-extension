export type GitExec = (args: readonly string[], signal?: AbortSignal) => Promise<string>;
