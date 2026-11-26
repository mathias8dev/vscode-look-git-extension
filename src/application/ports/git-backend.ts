import type { GitOutputFormat } from '@application/ports/git-output-format';

export interface GitRunOptions {
    readonly env?: Readonly<Record<string, string>>;
    readonly signal?: AbortSignal;
    readonly outputFormat?: GitOutputFormat;
}

export interface GitBackend {
    run(args: readonly string[], options?: GitRunOptions & { readonly outputFormat?: GitOutputFormat.Text }): Promise<string>;
    run(args: readonly string[], options: GitRunOptions & { readonly outputFormat: GitOutputFormat.Bytes }): Promise<Uint8Array>;
    run(args: readonly string[], options: GitRunOptions): Promise<string | Uint8Array>;
}
