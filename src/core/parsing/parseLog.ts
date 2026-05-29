import type { GitCommit, GitGraphCommit } from '../git/domain/GitCommit';

export const LOG_FIELD_SEP = '\x1f';
export const LOG_RECORD_SEP = '\x1e';

export function parseCommitLog(output: string): GitCommit[] {
    if (!output) { return []; }
    return output
        .split(LOG_RECORD_SEP)
        .map((r) => r.replace(/^\n/, '').replace(/\n$/, ''))
        .filter(Boolean)
        .map((record) => {
            const parts = record.split(LOG_FIELD_SEP);
            return {
                hash: parts[0] ?? '',
                shortHash: parts[1] ?? '',
                message: parts[2] ?? '',
                authorName: parts[3] ?? '',
                authorEmail: parts[4] ?? '',
                authorDate: parts[5] ?? '',
                parentHashes: parts[6] ? parts[6].split(' ') : [],
            };
        });
}

export function parseGraphLog(output: string): GitGraphCommit[] {
    if (!output) { return []; }
    return output
        .split(LOG_RECORD_SEP)
        .map((r) => r.replace(/^\n/, '').replace(/\n$/, ''))
        .filter(Boolean)
        .map((record) => {
            const parts = record.split(LOG_FIELD_SEP);
            const refs = parts[7]
                ? parts[7].split(',').map((ref) => ref.trim()).filter(Boolean)
                : [];
            return {
                hash: parts[0] ?? '',
                shortHash: parts[1] ?? '',
                message: parts[2] ?? '',
                authorName: parts[3] ?? '',
                authorEmail: parts[4] ?? '',
                authorDate: parts[5] ?? '',
                parentHashes: parts[6] ? parts[6].split(' ') : [],
                refs,
            };
        });
}
