import type { GitFileChange, GitFileStatus } from '@core/git/domain/git-commit';

export interface RawFileChange extends GitFileChange {
    readonly oldRevision: string;
    readonly newRevision: string;
}

export function parseDiffRawZ(output: string): readonly RawFileChange[] {
    const tokens = output.split('\0');
    const result: RawFileChange[] = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) { continue; }
        const match = /^:(\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([AMDRCTU])\d*$/.exec(token);
        if (!match) { throw new Error('Invalid git raw diff record.'); }
        const status = fileStatus(match[5]);
        const firstPath = tokens[++index];
        const renamed = status === 'R' || status === 'C';
        const filePath = renamed ? tokens[++index] : firstPath;
        if (!filePath || !firstPath) { throw new Error('Missing git raw diff path.'); }
        result.push({ status, filePath, ...(renamed ? { origPath: firstPath } : {}),
            ...(match[1] === '160000' || match[2] === '160000' ? { isSubmodule: true } : {}),
            oldRevision: match[3] ?? '', newRevision: match[4] ?? '' });
    }
    return result;
}

function fileStatus(value: string | undefined): GitFileStatus {
    switch (value) {
        case 'A': case 'M': case 'D': case 'R': case 'C': case 'T': case 'U': return value;
        default: throw new Error('Invalid git raw diff status.');
    }
}
