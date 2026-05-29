import type { GitStatusEntry, ConflictState } from '../git/domain/GitStatus';

const CONFLICT_CODES = new Set(['U', 'A', 'D']);

interface RawStatusResult {
    readonly staged: GitStatusEntry[];
    readonly unstaged: GitStatusEntry[];
    readonly conflicts: GitStatusEntry[];
}

/** Parse porcelain v1 -z output into staged/unstaged/conflict buckets. */
export function parsePorcelainStatus(output: string, submodulePaths: ReadonlySet<string> = new Set()): RawStatusResult {
    const staged: GitStatusEntry[] = [];
    const unstaged: GitStatusEntry[] = [];
    const conflicts: GitStatusEntry[] = [];

    if (!output) { return { staged, unstaged, conflicts }; }

    const tokens = output.split('\0');
    for (let i = 0; i < tokens.length;) {
        const line = tokens[i++];
        if (!line || line.length < 3) { continue; }

        const indexStatus = line[0] ?? ' ';
        const workTreeStatus = line[1] ?? ' ';
        const filePath = line.substring(3);
        let origPath: string | undefined;

        if (indexStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'R' || workTreeStatus === 'C') {
            origPath = tokens[i++] || undefined;
        }

        const isSubmodule = submodulePaths.has(filePath) || undefined;
        const entry: GitStatusEntry = { indexStatus, workTreeStatus, filePath, origPath, isSubmodule };
        const isConflict = indexStatus === 'U' || workTreeStatus === 'U'
            || (CONFLICT_CODES.has(indexStatus) && CONFLICT_CODES.has(workTreeStatus));

        if (isConflict) {
            conflicts.push(entry);
        } else {
            if (indexStatus !== ' ' && indexStatus !== '?') { staged.push(entry); }
            if (workTreeStatus !== ' ' || indexStatus === '?') { unstaged.push(entry); }
        }
    }

    return { staged, unstaged, conflicts };
}

/** Detect merge/rebase state from a list of files in the .git directory. */
export function detectConflictStateFromFiles(gitDirFiles: readonly string[]): ConflictState {
    const files = new Set(gitDirFiles);
    if (files.has('MERGE_HEAD')) { return 'merge'; }
    if (files.has('rebase-merge') || files.has('rebase-apply')) { return 'rebase'; }
    return 'none';
}
