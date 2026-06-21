import type { GitExec } from '@extension/git/git-exec';
import type { GitStatus, GitStash } from '@core/git/domain/GitStatus';
import type { GitFileChange } from '@core/git/domain/GitCommit';
import { parsePorcelainStatus } from '@core/parsing/parseStatus';
import { parseSubmodulePaths } from '@core/parsing/parseSubmoduleStatus';
import { parseNameStatusZ } from '@core/parsing/parseNameStatus';

export async function queryStatus(
    execRawReadonly: GitExec,
    signal?: AbortSignal,
): Promise<GitStatus> {
    const [output, submodulePaths] = await Promise.all([
        execRawReadonly(['status', '--porcelain=v1', '-z', '-u'], signal),
        querySubmodulePaths(execRawReadonly, signal),
    ]);

    const { staged, unstaged, conflicts } = parsePorcelainStatus(output, submodulePaths);
    return { staged, unstaged, conflicts, conflictState: 'none' };
}

export async function querySubmodulePaths(
    execRawReadonly: GitExec,
    signal?: AbortSignal,
): Promise<Set<string>> {
    try {
        const output = await execRawReadonly(['submodule', 'status'], signal);
        return parseSubmodulePaths(output);
    } catch {
        return new Set();
    }
}

export async function queryStashList(
    execReadonly: GitExec,
    signal?: AbortSignal,
): Promise<GitStash[]> {
    const output = await execReadonly(['stash', 'list', '--format=%gd %s'], signal);
    if (!output) { return []; }
    return output.split('\n').filter(Boolean).map((line) => {
        const match = line.match(/^stash@\{(\d+)\}\s+(.*)/);
        if (!match) { return { index: 0, message: line }; }
        return { index: parseInt(match[1] ?? '0', 10), message: match[2] ?? '' };
    });
}

export async function queryStashFiles(
    execRawReadonly: GitExec,
    index: number,
    signal?: AbortSignal,
): Promise<GitFileChange[]> {
    const output = await execRawReadonly(
        ['stash', 'show', '--include-untracked', '--name-status', '-M', '-z', `stash@{${index}}`],
        signal,
    );
    return output ? parseNameStatusZ(output) : [];
}
