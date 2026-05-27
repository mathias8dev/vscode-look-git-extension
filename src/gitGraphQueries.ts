import { LOG_FIELD_SEP, LOG_RECORD_SEP, parseTrackingStatus } from './gitParsers';
import type { BranchInfo, GraphCommitInfo, GraphLogFilters, TagInfo } from './gitTypes';

type GitExec = (args: string[], env?: Record<string, string>) => Promise<string>;

export async function getAllBranches(
    execRawReadonly: GitExec,
    getCurrentBranch: () => Promise<string>,
): Promise<BranchInfo[]> {
    const format = [
        '%(refname)',
        '%(objectname:short)',
        '%(upstream:short)',
        '%(upstream:track)',
    ].join('%00');

    const [output, currentBranch] = await Promise.all([
        execRawReadonly(['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes']),
        getCurrentBranch().catch(() => 'HEAD'),
    ]);

    if (!output) { return []; }

    return output.split('\n').filter(Boolean).flatMap((line) => {
        const parts = line.split('\0');
        const refName = parts[0];
        const isRemote = refName.startsWith('refs/remotes/');
        if (isRemote && refName.endsWith('/HEAD')) {
            return [];
        }

        const name = isRemote
            ? refName.replace(/^refs\/remotes\//, '')
            : refName.replace(/^refs\/heads\//, '');
        const tracking = parseTrackingStatus(parts[3] ?? '');
        return {
            name,
            isCurrent: !isRemote && name === currentBranch,
            hash: parts[1],
            upstream: parts[2] || undefined,
            ahead: tracking.ahead,
            behind: tracking.behind,
            isRemote,
        };
    });
}

export async function getAllTags(execRawReadonly: GitExec): Promise<TagInfo[]> {
    const format = '%(refname:short)%00%(objectname:short)';
    const output = await execRawReadonly(['tag', `--format=${format}`]);
    if (!output) { return []; }

    return output.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('\0');
        return {
            name: parts[0],
            hash: parts[1],
        };
    });
}

export async function getGraphLog(
    execRawReadonly: GitExec,
    maxCount: number,
    branches?: string[],
    pathFilter?: string,
    filters: GraphLogFilters = {},
): Promise<GraphCommitInfo[]> {
    const format = [
        '%H', '%h', '%s', '%an', '%ae', '%aI', '%P', '%D',
    ].join('%x1f') + '%x1e';

    const search = filters.search?.trim();
    const searchScanLimit = search
        ? Math.max(maxCount, Math.min(maxCount * 20, 5000))
        : maxCount;
    const args = ['log', `--format=${format}`, `--max-count=${searchScanLimit}`, '--topo-order'];
    const authors = filters.authors?.map((author) => author.trim()).filter(Boolean) ?? [];
    const dateFrom = filters.dateFrom?.trim();
    const dateTo = filters.dateTo?.trim();

    if (dateFrom) { args.push(`--since=${dateFrom}T00:00:00`); }
    if (dateTo) { args.push(`--until=${dateTo}T23:59:59`); }
    for (const author of authors) {
        args.push(`--author=${author}`);
    }

    args.push(...(branches && branches.length > 0 ? branches : ['--all']));
    if (pathFilter) {
        args.push('--', pathFilter);
    }

    const output = await execRawReadonly(args);
    if (!output) { return []; }

    let commits = parseGraphLogOutput(output);
    if (search) {
        const normalizedSearch = search.toLowerCase();
        for (const commit of commits) {
            commit.matchesFilter = commitMatchesGraphSearch(commit, normalizedSearch);
        }
        commits = includeGraphSearchContext(commits, maxCount);
    }

    return commits.slice(0, maxCount);
}

export async function getUserName(execReadonly: GitExec): Promise<string> {
    try {
        return (await execReadonly(['config', 'user.name'])).trim();
    } catch {
        return '';
    }
}

function parseGraphLogOutput(output: string): GraphCommitInfo[] {
    return output.split(LOG_RECORD_SEP)
        .map((record) => record.replace(/^\n/, '').replace(/\n$/, ''))
        .filter(Boolean)
        .map((record) => {
            const parts = record.split(LOG_FIELD_SEP);
            const refs = parts[7]
                ? parts[7].split(',').map((ref) => ref.trim()).filter(Boolean)
                : [];
            return {
                hash: parts[0],
                shortHash: parts[1],
                message: parts[2],
                authorName: parts[3],
                authorEmail: parts[4],
                authorDate: new Date(parts[5]),
                parentHashes: parts[6] ? parts[6].split(' ') : [],
                refs,
            };
        });
}

function includeGraphSearchContext(commits: GraphCommitInfo[], maxCount: number): GraphCommitInfo[] {
    const byHash = new Map(commits.map((commit) => [commit.hash, commit]));
    const included = new Set<string>();
    const contextDepth = 12;

    for (const commit of commits) {
        if (!commit.matchesFilter) {
            continue;
        }

        included.add(commit.hash);
        const pending = commit.parentHashes.map((hash) => ({ hash, depth: 1 }));
        while (pending.length > 0) {
            const next = pending.shift()!;
            if (next.depth > contextDepth || included.has(next.hash)) {
                continue;
            }

            const parent = byHash.get(next.hash);
            if (!parent) {
                continue;
            }

            included.add(parent.hash);
            for (const parentHash of parent.parentHashes) {
                pending.push({ hash: parentHash, depth: next.depth + 1 });
            }
        }

        if (included.size >= maxCount * 2) {
            break;
        }
    }

    const contextualCommits = commits.filter((commit) => included.has(commit.hash));
    return contextualCommits.length > 0
        ? contextualCommits
        : commits.filter((commit) => commit.matchesFilter);
}

function commitMatchesGraphSearch(commit: GraphCommitInfo, normalizedSearch: string): boolean {
    return commit.message.toLowerCase().includes(normalizedSearch)
        || commit.hash.toLowerCase().includes(normalizedSearch)
        || commit.shortHash.toLowerCase().includes(normalizedSearch)
        || commit.authorName.toLowerCase().includes(normalizedSearch)
        || commit.authorEmail.toLowerCase().includes(normalizedSearch);
}
