export interface GitRunOptions {
    readonly env?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
}

export interface GitBackend {
    run(args: readonly string[], options?: GitRunOptions): Promise<string>;
}
