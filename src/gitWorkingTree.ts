import * as fsSync from 'fs';
import * as path from 'path';
import { parseNameStatusZ } from './gitParsers';
import type { GitFileChange, GitStatus, GitStatusEntry, StashEntry, WorktreeInfo } from './gitTypes';

type GitExec = (args: string[], env?: Record<string, string>) => Promise<string>;

export async function getSubmodulePaths(execRawReadonly: GitExec): Promise<Set<string>> {
    try {
        const output = await execRawReadonly(['submodule', 'status']);
        if (!output) { return new Set(); }
        const paths = new Set<string>();
        for (const line of output.split('\n')) {
            if (!line) { continue; }
            // Format: [+-U ]<sha> <path> [(<desc>)]
            const match = line.match(/^[ +\-U][0-9a-f]+ (.+?)( \(.*\))?$/);
            if (match) { paths.add(match[1].trim()); }
        }
        return paths;
    } catch {
        return new Set();
    }
}

export async function listWorktrees(execRawReadonly: GitExec): Promise<WorktreeInfo[]> {
    try {
        const output = await execRawReadonly(['worktree', 'list', '--porcelain']);
        if (!output) { return []; }

        const worktrees: WorktreeInfo[] = [];
        const stanzas = output.split(/\n\n+/);

        for (let i = 0; i < stanzas.length; i++) {
            const stanza = stanzas[i].trim();
            if (!stanza) { continue; }

            const lines = stanza.split('\n');
            let wtPath = '';
            let head = '';
            let branch: string | undefined;
            let isDetached = false;

            for (const line of lines) {
                if (line.startsWith('worktree ')) { wtPath = line.slice('worktree '.length); }
                else if (line.startsWith('HEAD ')) { head = line.slice('HEAD '.length); }
                else if (line.startsWith('branch ')) { branch = line.slice('branch '.length); }
                else if (line === 'detached') { isDetached = true; }
            }

            if (!wtPath) { continue; }
            worktrees.push({ path: wtPath, head, branch, isMain: i === 0, isDetached });
        }

        return worktrees;
    } catch {
        return [];
    }
}

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

    const submodulePaths = await getSubmodulePaths(execRawReadonly);

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

        const isSubmodule = submodulePaths.has(filePath) || undefined;
        const entry: GitStatusEntry = { indexStatus, workTreeStatus, filePath, origPath, isSubmodule };
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
