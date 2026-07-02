import type { GitBlameLine } from '@core/git/domain/git-blame';

export function parseBlame(raw: string): GitBlameLine[] {
    if (!raw.trim()) { return []; }

    const lines = raw.split(/\r?\n/);
    const blameLines: GitBlameLine[] = [];
    let current: {
        commit: string;
        line: number;
        author: string;
        authorTime: number | undefined;
        summary: string | undefined;
    } | undefined;

    for (const line of lines) {
        const header = line.match(/^([0-9a-f]{40}|0{40}) \d+ (\d+)(?: \d+)?$/);
        if (header) {
            current = {
                commit: header[1] ?? '',
                line: Number(header[2] ?? 0),
                author: '',
                authorTime: undefined,
                summary: undefined,
            };
            continue;
        }

        if (!current) { continue; }

        if (line.startsWith('author ')) {
            current.author = line.slice('author '.length);
            continue;
        }
        if (line.startsWith('author-time ')) {
            const value = Number(line.slice('author-time '.length));
            current.authorTime = Number.isFinite(value) ? value : undefined;
            continue;
        }
        if (line.startsWith('summary ')) {
            current.summary = line.slice('summary '.length);
            continue;
        }
        if (line.startsWith('\t')) {
            blameLines.push({
                line: current.line,
                commit: current.commit,
                author: current.author,
                authorTime: current.authorTime,
                summary: current.summary,
            });
            current = undefined;
        }
    }

    return blameLines;
}
