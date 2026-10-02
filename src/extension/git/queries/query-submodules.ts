import type { GitExec } from '@extension/git/git-exec';
import type { SubmoduleUpdateOptions } from '@application/ports/git-capabilities';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import { parseNullTerminatedGitConfigValues } from '@core/parsing/parse-git-config';
import { parseSubmoduleStatus } from '@core/parsing/parse-submodule-status';

export async function querySubmoduleStatus(execRawReadonly: GitExec, signal?: AbortSignal): Promise<GitSubmodule[]> {
    const paths = await queryRegisteredSubmodulePaths(execRawReadonly, signal);
    if (paths.length === 0) { return []; }
    const output = await execRawReadonly(['submodule', 'status', '--', ...paths], signal);
    return parseSubmoduleStatus(output);
}

export async function queryRegisteredSubmodulePaths(execRawReadonly: GitExec, signal?: AbortSignal): Promise<readonly string[]> {
    try {
        const output = await execRawReadonly([
            'config',
            '--file',
            '.gitmodules',
            '--null',
            '--get-regexp',
            '^submodule\\..*\\.path$',
        ], signal);
        return parseNullTerminatedGitConfigValues(output);
    } catch (error) {
        if (isAbortError(error) || !isMissingConfigValue(error)) { throw error; }
        return [];
    }
}

export async function updateSubmodule(exec: GitExec, submodulePath: string, options: SubmoduleUpdateOptions, signal?: AbortSignal): Promise<void> {
    await exec([
        '-c', 'protocol.file.allow=always', 'submodule', 'update',
        ...(options.init ? ['--init'] : []),
        ...(options.recursive ? ['--recursive'] : []),
        ...(options.remote ? ['--remote'] : []),
        '--', submodulePath,
    ], signal);
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function isMissingConfigValue(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) { return false; }
    return error.code === 1 || error.code === '1';
}
