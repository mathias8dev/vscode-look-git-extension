import * as fs from 'fs';
import type { GitExec } from '../git/GitRepository';
import type { GitStatus, GitStash } from '../git/domain/GitStatus';
import type { GitFileChange } from '../git/domain/GitCommit';
import { parsePorcelainStatus, detectConflictStateFromFiles } from '../parsing/parseStatus';
import { parseSubmodulePaths } from '../parsing/parseSubmoduleStatus';
import { parseNameStatusZ } from '../parsing/parseNameStatus';

export async function queryStatus(
    execRawReadonly: GitExec,
    getGitDir: () => Promise<string>,
    signal?: AbortSignal,
): Promise<GitStatus> {
    const [output, submodulePaths] = await Promise.all([
        execRawReadonly(['status', '--porcelain=v1', '-z', '-u'], signal),
        querySubmodulePaths(execRawReadonly, signal),
    ]);

    const { staged, unstaged, conflicts } = parsePorcelainStatus(output, submodulePaths);
    const conflictState = await detectConflictState(getGitDir);
    return { staged, unstaged, conflicts, conflictState };
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
    try {
        const output = await execReadonly(['stash', 'list', '--format=%gd %s'], signal);
        if (!output) { return []; }
        return output.split('\n').filter(Boolean).map((line) => {
            const match = line.match(/^stash@\{(\d+)\}\s+(.*)/);
            if (!match) { return { index: 0, message: line }; }
            return { index: parseInt(match[1] ?? '0', 10), message: match[2] ?? '' };
        });
    } catch {
        return [];
    }
}

export async function queryStashFiles(
    execRawReadonly: GitExec,
    index: number,
    signal?: AbortSignal,
): Promise<GitFileChange[]> {
    const output = await execRawReadonly(
        ['stash', 'show', '--name-status', '-M', '-z', `stash@{${index}}`],
        signal,
    );
    return output ? parseNameStatusZ(output) : [];
}

async function detectConflictState(getGitDir: () => Promise<string>) {
    try {
        const gitDir = await getGitDir();
        const entries = fs.readdirSync(gitDir);
        return detectConflictStateFromFiles(entries);
    } catch {
        return 'none' as const;
    }
}
