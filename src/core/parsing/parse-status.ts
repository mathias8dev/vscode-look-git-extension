import type { GitStatusEntry, ConflictState } from '@core/git/domain/git-status';

const CONFLICT_CODES = new Set(['U', 'A', 'D']);

interface RawStatusResult {
    readonly staged: GitStatusEntry[];
    readonly unstaged: GitStatusEntry[];
    readonly conflicts: GitStatusEntry[];
}

export interface PorcelainStatusSummary {
    readonly staged: number;
    readonly unstaged: number;
    readonly untracked: number;
    readonly conflicts: number;
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
        appendEntry({ staged, unstaged, conflicts }, entry);
    }

    return { staged, unstaged, conflicts };
}

export function parsePorcelainV2Status(output: string): RawStatusResult {
    const result: RawStatusResult = { staged: [], unstaged: [], conflicts: [] };
    const tokens = output.split('\0');
    for (let i = 0; i < tokens.length; i++) {
        const line = tokens[i];
        if (!line) { continue; }
        if (line.startsWith('? ')) {
            appendEntry(result, { indexStatus: '?', workTreeStatus: '?', filePath: line.slice(2) });
            continue;
        }

        const fields = line.split(' ');
        const kind = fields[0];
        const pathIndex = kind === '1' ? 8 : kind === '2' ? 9 : kind === 'u' ? 10 : undefined;
        const xy = fields[1];
        if (pathIndex === undefined || fields.length <= pathIndex || xy?.length !== 2) { continue; }
        const modeEnd = kind === 'u' ? 7 : 6;
        const isSubmodule = fields[2]?.startsWith('S') || fields.slice(3, modeEnd).includes('160000') || undefined;
        appendEntry(result, {
            indexStatus: xy[0] === '.' ? ' ' : xy[0] ?? ' ',
            workTreeStatus: xy[1] === '.' ? ' ' : xy[1] ?? ' ',
            filePath: fields.slice(pathIndex).join(' '),
            origPath: kind === '2' ? tokens[++i] || undefined : undefined,
            isSubmodule,
        });
    }
    return result;
}

function appendEntry(result: RawStatusResult, entry: GitStatusEntry): void {
    const { indexStatus, workTreeStatus } = entry;
    const isConflict = indexStatus === 'U' || workTreeStatus === 'U'
        || (CONFLICT_CODES.has(indexStatus) && CONFLICT_CODES.has(workTreeStatus));
    if (isConflict) {
        result.conflicts.push(entry);
        return;
    }
    if (indexStatus !== ' ' && indexStatus !== '?') { result.staged.push(entry); }
    if (workTreeStatus !== ' ' || indexStatus === '?') { result.unstaged.push(entry); }
}

export function summarizePorcelainStatus(output: string): PorcelainStatusSummary {
    return summarizeStatusEntries(parsePorcelainStatus(output));
}

export function summarizeStatusEntries(status: {
    readonly staged: readonly GitStatusEntry[];
    readonly unstaged: readonly GitStatusEntry[];
    readonly conflicts: readonly GitStatusEntry[];
}): PorcelainStatusSummary {
    let untracked = 0;
    let trackedUnstaged = 0;

    for (const entry of status.unstaged) {
        if (entry.indexStatus === '?' && entry.workTreeStatus === '?') {
            untracked++;
        } else {
            trackedUnstaged++;
        }
    }

    return {
        staged: status.staged.length,
        unstaged: trackedUnstaged,
        untracked,
        conflicts: status.conflicts.length,
    };
}

/** Detect merge/rebase state from a list of files in the .git directory. */
export function detectConflictStateFromFiles(gitDirFiles: readonly string[]): ConflictState {
    const files = new Set(gitDirFiles);
    if (files.has('rebase-merge') || files.has('rebase-apply')) { return 'rebase'; }
    if (files.has('MERGE_HEAD')) { return 'merge'; }
    return 'none';
}
