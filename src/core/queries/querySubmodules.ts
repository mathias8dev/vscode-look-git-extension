import type { GitExec } from '../git/GitRepository';
import type { GitSubmodule } from '../git/domain/GitWorktree';
import { parseSubmoduleStatus } from '../parsing/parseSubmoduleStatus';

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
