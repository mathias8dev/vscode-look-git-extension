import * as fsSync from 'fs';
import * as path from 'path';
import { parseNameStatusZ } from './gitParsers';
import type { GitFileChange, GitStatus, GitStatusEntry, StashEntry } from './gitTypes';

type GitExec = (args: string[], env?: Record<string, string>) => Promise<string>;

export async function getStatus(
    execRawReadonly: GitExec,
    getGitDir: () => Promise<string>,
): Promise<GitStatus> {
    const output = await execRawReadonly(['status', '--porcelain=v1', '-z', '-u']);
    const staged: GitStatusEntry[] = [];
    const unstaged: GitStatusEntry[] = [];
    const conflicts: GitStatusEntry[] = [];

    if (!output) {
        const conflictState = await detectConflictState(getGitDir);
        return { staged, unstaged, conflicts, conflictState };
    }

    const conflictCodes = new Set(['U', 'A', 'D']);
    const tokens = output.split('\0');
    for (let i = 0; i < tokens.length;) {
        const line = tokens[i++];
        if (!line || line.length < 3) { continue; }

        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filePath = line.substring(3);
        let origPath: string | undefined;

        if (indexStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'R' || workTreeStatus === 'C') {
            origPath = tokens[i++] || undefined;
        }

        const entry: GitStatusEntry = { indexStatus, workTreeStatus, filePath, origPath };
        const isConflict = indexStatus === 'U' || workTreeStatus === 'U'
            || (conflictCodes.has(indexStatus) && conflictCodes.has(workTreeStatus));

        if (isConflict) {
            conflicts.push(entry);
        } else {
            if (indexStatus !== ' ' && indexStatus !== '?') {
                staged.push(entry);
            }
            if (workTreeStatus !== ' ' || indexStatus === '?') {
                unstaged.push(entry);
            }
        }
    }

    const conflictState = await detectConflictState(getGitDir);
    return { staged, unstaged, conflicts, conflictState };
}

export async function getTrackingBranch(
    execReadonly: GitExec,
): Promise<{ remote: string; branch: string } | undefined> {
    try {
        const upstream = await execReadonly(['rev-parse', '--abbrev-ref', '@{upstream}']);
        const [remote, ...branchParts] = upstream.split('/');
        return { remote, branch: branchParts.join('/') };
    } catch {
        return undefined;
    }
}

export async function stashList(execReadonly: GitExec): Promise<StashEntry[]> {
    try {
        const output = await execReadonly(['stash', 'list', '--format=%gd %s']);
        if (!output) { return []; }
        return output.split('\n').map((line) => {
            const match = line.match(/^stash@\{(\d+)\}\s+(.*)/);
            if (!match) { return { index: 0, message: line }; }
            return { index: parseInt(match[1], 10), message: match[2] };
        });
    } catch {
        return [];
    }
}

export async function getStashFiles(execRawReadonly: GitExec, index: number): Promise<GitFileChange[]> {
    const output = await execRawReadonly(['stash', 'show', '--name-status', '-M', '-z', `stash@{${index}}`]);
    return output ? parseNameStatusZ(output) : [];
}

async function detectConflictState(getGitDir: () => Promise<string>): Promise<'none' | 'merge' | 'rebase'> {
    try {
        const gitDir = await getGitDir();
        if (fsSync.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
            return 'merge';
        }
        if (
            fsSync.existsSync(path.join(gitDir, 'rebase-merge'))
            || fsSync.existsSync(path.join(gitDir, 'rebase-apply'))
        ) {
            return 'rebase';
        }
    } catch {
        return 'none';
    }
    return 'none';
}
