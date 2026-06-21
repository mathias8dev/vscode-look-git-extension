import type { GitExec } from '@extension/git/git-exec';
import type { GitSubmodule } from '@core/git/domain/GitWorktree';
import { parseSubmoduleStatus } from '@core/parsing/parseSubmoduleStatus';

export async function querySubmoduleStatus(execRawReadonly: GitExec, signal?: AbortSignal): Promise<GitSubmodule[]> {
    const output = await execRawReadonly(['submodule', 'status'], signal);
    return parseSubmoduleStatus(output);
}

export async function updateSubmodule(exec: GitExec, submodulePath: string, signal?: AbortSignal): Promise<void> {
    await exec(['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', submodulePath], signal);
}

export async function updateAllSubmodules(exec: GitExec, signal?: AbortSignal): Promise<void> {
    await exec(['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--recursive'], signal);
}
