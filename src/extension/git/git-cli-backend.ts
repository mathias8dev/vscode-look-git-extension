import { spawn } from 'child_process';
import * as path from 'path';
import type { GitBackend, GitRunOptions } from '@application/ports/git-backend';
import { GitOutputFormat } from '@application/ports/git-output-format';

const DEFAULT_MAX_LOCK_RETRIES = 8;

export class GitCliBackend implements GitBackend {
    constructor(
        private readonly cwd: string,
        private readonly maxLockRetries = DEFAULT_MAX_LOCK_RETRIES,
        private readonly gitPath = 'git',
    ) {}

    run(args: readonly string[], options?: GitRunOptions & { readonly outputFormat?: GitOutputFormat.Text }): Promise<string>;
    run(args: readonly string[], options: GitRunOptions & { readonly outputFormat: GitOutputFormat.Bytes }): Promise<Uint8Array>;
    run(args: readonly string[], options: GitRunOptions): Promise<string | Uint8Array>;
    async run(args: readonly string[], options: GitRunOptions = {}): Promise<string | Uint8Array> {
        let delayMs = 80;
        for (let attempt = 0; ; attempt++) {
            options.signal?.throwIfAborted();
            try {
                const invocation = executableInvocation(this.gitPath, args);
                const stdout = await new Promise<Buffer>((resolve, reject) => {
                    const child = spawn(invocation.command, invocation.args, {
                        cwd: this.cwd,
                        env: { ...process.env, ...options.env },
                        signal: options.signal,
                        stdio: ['ignore', 'pipe', 'pipe'],
                    });
                    const stdoutChunks: Buffer[] = [];
                    const stderrChunks: Buffer[] = [];
                    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
                    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
                    child.once('error', reject);
                    child.once('close', (code, signal) => {
                        const output = Buffer.concat(stdoutChunks);
                        if (code === 0) { resolve(output); return; }
                        const stderr = Buffer.concat(stderrChunks).toString('utf8');
                        reject(Object.assign(new Error(`Command failed: ${invocation.command} ${invocation.args.join(' ')}\n${stderr}`), {
                            code, signal, stdout: output.toString('utf8'), stderr,
                        }));
                    });
                });
                return options.outputFormat === GitOutputFormat.Bytes ? stdout : stdout.toString('utf8');
            } catch (error) {
                if (attempt >= this.maxLockRetries || !isIndexLockError(error)) { throw error; }
                await sleep(delayMs, options.signal);
                delayMs *= 2;
            }
        }
    }
}

function executableInvocation(command: string, args: readonly string[]): { readonly command: string; readonly args: readonly string[] } {
    return path.extname(command).toLowerCase() === '.js'
        ? { command: process.execPath, args: [command, ...args] }
        : { command, args: [...args] };
}

function isIndexLockError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr = typeof error === 'object' && error !== null
        && typeof (error as { stderr?: unknown }).stderr === 'string'
        ? (error as { stderr: string }).stderr : '';
    const combined = `${msg}\n${stderr}`;
    return combined.includes('index.lock')
        || (combined.includes('Unable to create') && combined.includes('File exists'));
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(signal?.reason);
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}
