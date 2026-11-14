export interface FileLineStats {
    readonly filePath: string;
    readonly additions: number | null;
    readonly deletions: number | null;
}

export function parseNumstat(output: string): readonly FileLineStats[] {
    const tokens = output.split('\0');
    const result: FileLineStats[] = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) { continue; }
        const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token);
        if (!match) { throw new Error('Invalid git numstat record.'); }
        let filePath = match[3] ?? '';
        if (!filePath) {
            index++;
            filePath = tokens[++index] ?? '';
        }
        if (!filePath) { throw new Error('Missing git numstat path.'); }
        result.push({ filePath, additions: match[1] === '-' ? null : Number(match[1]), deletions: match[2] === '-' ? null : Number(match[2]) });
    }
    return result;
}
