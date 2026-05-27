import type { GitCommitInfo, GitFileChange, GitFileStatus } from './gitTypes';

export const LOG_FIELD_SEP = '\x1f';
export const LOG_RECORD_SEP = '\x1e';

export function parseCommitLog(output: string): GitCommitInfo[] {
    if (!output) { return []; }
    return output.split(LOG_RECORD_SEP)
        .map((record) => record.replace(/^\n/, '').replace(/\n$/, ''))
        .filter(Boolean)
        .map((record) => {
            const parts = record.split(LOG_FIELD_SEP);
            return {
                hash: parts[0],
                shortHash: parts[1],
                message: parts[2],
                authorName: parts[3],
                authorEmail: parts[4],
                authorDate: new Date(parts[5]),
                parentHashes: parts[6] ? parts[6].split(' ') : [],
            };
        });
}

export function parseNameStatusZ(output: string, parentHash?: string): GitFileChange[] {
    const seen = new Set<string>();
    const result: GitFileChange[] = [];
    const tokens = output.split('\0');

    for (let i = 0; i < tokens.length;) {
        const statusToken = tokens[i++];
        if (!statusToken) {
            continue;
        }
        const status = statusToken.charAt(0) as GitFileStatus;
        let origPath: string | undefined;
        let filePath = tokens[i++];

        if ((status === 'R' || status === 'C') && filePath) {
            origPath = filePath;
            filePath = tokens[i++];
        }

        if (filePath && !seen.has(filePath)) {
            seen.add(filePath);
            result.push({ status, filePath, origPath, parentHash });
        }
    }

    return result;
}

export function parseTrackingStatus(track: string): { ahead: number; behind: number } {
    const ahead = Number(track.match(/\bahead (\d+)\b/)?.[1] ?? 0);
    const behind = Number(track.match(/\bbehind (\d+)\b/)?.[1] ?? 0);
    return { ahead, behind };
}
