import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import type { GitBackend, GitRunOptions } from '@application/ports/git-backend';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_MAX_LOCK_RETRIES = 8;

export class GitCliBackend implements GitBackend {
    constructor(
        private readonly cwd: string,
        private readonly maxBuffer = DEFAULT_MAX_BUFFER,
        private readonly maxLockRetries = DEFAULT_MAX_LOCK_RETRIES,
        private readonly gitPath = 'git',
    ) {}

    async run(args: readonly string[], options: GitRunOptions = {}): Promise<string> {
        let delayMs = 80;
        for (let attempt = 0; ; attempt++) {
            options.signal?.throwIfAborted();
            try {
                const invocation = executableInvocation(this.gitPath, args);
                const { stdout } = await execFileAsync(invocation.command, invocation.args, {
                    cwd: this.cwd,
                    maxBuffer: this.maxBuffer,
                    env: { ...process.env, ...options.env },
                    signal: options.signal,
                });
                return stdout;
            } catch (error) {
                if (attempt >= this.maxLockRetries || !isIndexLockError(error)) { throw error; }
                await sleep(delayMs);
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

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}
