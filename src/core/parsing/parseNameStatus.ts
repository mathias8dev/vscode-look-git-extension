import type { GitFileChange, GitFileStatus } from '../git/domain/GitCommit';

export function parseNameStatusZ(output: string, parentHash?: string): GitFileChange[] {
    const seen = new Set<string>();
    const result: GitFileChange[] = [];
    const tokens = output.split('\0');

    for (let i = 0; i < tokens.length;) {
        const statusToken = tokens[i++];
        if (!statusToken) { continue; }
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
