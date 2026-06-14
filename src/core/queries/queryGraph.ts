import type { GitExec } from '../git/git-exec';
import type { GitGraphCommit, GitFileChange, GitCommit } from '../git/domain/GitCommit';
import type { GitBranch, GitTag } from '../git/domain/GitStatus';
import { parseGraphLog, parseCommitLog, LOG_FIELD_SEP, LOG_RECORD_SEP } from '../parsing/parseLog';
import { parseNameStatusZ } from '../parsing/parseNameStatus';
import { parseTrackingStatus } from '../parsing/parseTrackingStatus';

export interface GraphLogFilters {
    readonly search?: string;
    readonly authors?: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly skip?: number;
}

const LOG_FORMAT = ['%H', '%h', '%s', '%an', '%ae', '%aI', '%P', '%D'].join(LOG_FIELD_SEP) + LOG_RECORD_SEP;

export async function queryGraphLog(
    execRawReadonly: GitExec,
    maxCount: number,
    branches?: readonly string[],
    pathFilter?: string,
    filters: GraphLogFilters = {},
    signal?: AbortSignal,
): Promise<GitGraphCommit[]> {
    const search = filters.search?.trim();
    if (search) {
        return querySearchedGraphLog(execRawReadonly, maxCount, branches, pathFilter, filters, search, signal);
    }

    const { args, usesDefaultRefs } = buildGraphLogArgs(maxCount, branches, pathFilter, filters, {
        skip: filters.skip,
    });
    const output = await execGraphLog(execRawReadonly, args, usesDefaultRefs, signal);
    return parseGraphLog(output).slice(0, maxCount);
}

export async function queryCommitLog(
    execRawReadonly: GitExec,
    limit: number,
    skip: number,
    ref?: string,
    pathFilter?: string,
    signal?: AbortSignal,
): Promise<GitCommit[]> {
    const format = ['%H', '%h', '%s', '%an', '%ae', '%aI', '%P'].join(LOG_FIELD_SEP) + LOG_RECORD_SEP;
    const args = ['log', `--format=${format}`, `--max-count=${limit}`, `--skip=${skip}`];
    if (ref) { args.push(ref); }
    if (pathFilter) { args.push('--', pathFilter); }
    let output: string;
    try {
        output = await execRawReadonly(args, signal);
    } catch (error) {
        if (isUnbornCommitHistoryError(error, ref)) { return []; }
        throw error;
    }
    return parseCommitLog(output);
}

export async function queryAllBranches(
    execRawReadonly: GitExec,
    getCurrentBranch: (signal?: AbortSignal) => Promise<string>,
    signal?: AbortSignal,
): Promise<GitBranch[]> {
    const format = ['%(refname)', '%(objectname)', '%(upstream:short)', '%(upstream:track)'].join('%00');
    const [output, currentBranch] = await Promise.all([
        execRawReadonly(['for-each-ref', `--format=${format}`, 'refs/heads', 'refs/remotes'], signal),
        getCurrentBranch(signal).catch(() => 'HEAD'),
    ]);
    if (!output) { return []; }

    return output.split('\n').filter(Boolean).flatMap((line) => {
        const parts = line.split('\0');
        const refName = parts[0] ?? '';
        const isRemote = refName.startsWith('refs/remotes/');
        if (isRemote && refName.endsWith('/HEAD')) { return []; }
        const name = isRemote ? refName.replace('refs/remotes/', '') : refName.replace('refs/heads/', '');
        const tracking = parseTrackingStatus(parts[3] ?? '');
        return [{
            name,
            isCurrent: !isRemote && name === currentBranch,
            hash: parts[1] ?? '',
            upstream: parts[2] || undefined,
            ahead: tracking.ahead,
            behind: tracking.behind,
            isRemote,
        }];
    });
}

export async function queryAllTags(execRawReadonly: GitExec, signal?: AbortSignal): Promise<GitTag[]> {
    const format = '%(refname:short)%00%(objectname)';
    const output = await execRawReadonly(['tag', `--format=${format}`], signal);
    if (!output) { return []; }
    return output.split('\n').filter(Boolean).map((line) => {
        const parts = line.split('\0');
        return { name: parts[0] ?? '', hash: parts[1] ?? '' };
    });
}

export async function queryCurrentBranch(execReadonly: GitExec, signal?: AbortSignal): Promise<string> {
    try { return await execReadonly(['rev-parse', '--abbrev-ref', 'HEAD'], signal); }
    catch { return 'HEAD'; }
}

export async function queryUserName(execReadonly: GitExec, signal?: AbortSignal): Promise<string> {
    try { return await execReadonly(['config', 'user.name'], signal); }
    catch { return ''; }
}

export async function queryRemotes(execReadonly: GitExec, signal?: AbortSignal): Promise<string[]> {
    const output = await execReadonly(['remote'], signal);
    return output ? output.split('\n').filter(Boolean) : [];
}

export async function queryCommitFiles(
    execRawReadonly: GitExec,
    commitHash: string,
    signal?: AbortSignal,
): Promise<GitFileChange[]> {
    const parents = await queryParentHashes(execRawReadonly, commitHash, signal);
    const submodulePaths = await queryGitlinkPaths(execRawReadonly, parents, commitHash, signal);

    if (parents.length === 0) {
        const output = await execRawReadonly(['diff-tree', '--root', '--no-commit-id', '-r', '-M', '--name-status', '-z', commitHash], signal);
        return markSubmodules(output ? parseNameStatusZ(output) : [], submodulePaths);
    }

    const result: GitFileChange[] = [];
    const seen = new Set<string>();
    for (const parentHash of parents) {
        const output = await execRawReadonly(['diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', parentHash, commitHash], signal);
        for (const change of parseNameStatusZ(output, parentHash)) {
            const key = `${parentHash}:${change.filePath}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push(submodulePaths.has(change.filePath) ? { ...change, isSubmodule: true } : change);
            }
        }
    }
    return result;
}

export async function queryCommitMessage(execReadonly: GitExec, commitHash: string, signal?: AbortSignal): Promise<string> {
    return execReadonly(['log', '-1', '--format=%B', commitHash], signal);
}

async function queryParentHashes(execRawReadonly: GitExec, commitHash: string, signal?: AbortSignal): Promise<string[]> {
    const output = await execRawReadonly(['rev-list', '--parents', '-n', '1', commitHash], signal);
    const [, ...parents] = output.split(/\s+/);
    return parents.filter(Boolean);
}

async function queryGitlinkPaths(execRawReadonly: GitExec, parents: string[], commitHash: string, signal?: AbortSignal): Promise<Set<string>> {
    try {
        const args = parents.length === 0
            ? ['diff-tree', '--root', '--no-commit-id', '-r', '--raw', '-z', commitHash]
            : ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', parents[0]!, commitHash];
        const raw = await execRawReadonly(args, signal);
        const paths = new Set<string>();
        const tokens = raw.split('\0');
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (!token?.startsWith(':')) { continue; }
            const parts = token.split(' ');
            if (parts[1] === '160000') {
                const filePath = tokens[++i];
                if (filePath) { paths.add(filePath); }
            }
        }
        return paths;
    } catch { return new Set(); }
}

function markSubmodules(files: GitFileChange[], paths: Set<string>): GitFileChange[] {
    return files.map((f) => paths.has(f.filePath) ? { ...f, isSubmodule: true } : f);
}

function removeFirstHeadRevision(args: readonly string[]): string[] {
    const headIndex = args.indexOf('HEAD');
    if (headIndex < 0) { return [...args]; }
    return [...args.slice(0, headIndex), ...args.slice(headIndex + 1)];
}

interface BuildGraphLogArgsOptions {
    readonly extraArgs?: readonly string[];
    readonly skip?: number;
}

function buildGraphLogArgs(
    maxCount: number,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    options: BuildGraphLogArgsOptions = {},
): { readonly args: readonly string[]; readonly usesDefaultRefs: boolean } {
    const args = [
        'log',
        '--parents',
        `--format=${LOG_FORMAT}`,
        `--max-count=${maxCount}`,
        '--topo-order',
        ...(options.extraArgs ?? []),
    ];
    const skip = Math.max(0, Math.floor(options.skip ?? 0));
    if (skip > 0) { args.push(`--skip=${skip}`); }

    if (filters.dateFrom) { args.push(`--since=${filters.dateFrom}T00:00:00`); }
    if (filters.dateTo)   { args.push(`--until=${filters.dateTo}T23:59:59`); }
    for (const author of filters.authors ?? []) { args.push(`--author=${author}`); }
    const usesDefaultRefs = !branches?.length;
    if (branches?.length) { args.push(...branches); }
    else { args.push('HEAD', '--branches', '--tags', '--remotes'); }
    if (pathFilter) { args.push('--', pathFilter); }
    return { args, usesDefaultRefs };
}

async function execGraphLog(
    execRawReadonly: GitExec,
    args: readonly string[],
    usesDefaultRefs: boolean,
    signal?: AbortSignal,
): Promise<string> {
    try {
        return await execRawReadonly(args, signal);
    } catch (error) {
        if (!usesDefaultRefs || !isUnbornHeadHistoryError(error)) { throw error; }
        return execRawReadonly(removeFirstHeadRevision(args), signal);
    }
}

async function querySearchedGraphLog(
    execRawReadonly: GitExec,
    maxCount: number,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    search: string,
    signal?: AbortSignal,
): Promise<GitGraphCommit[]> {
    const normalizedSearch = search.toLowerCase();
    const [messageMatches, hashCandidates] = await Promise.all([
        queryMessageSearchMatches(execRawReadonly, maxCount, branches, pathFilter, filters, search, normalizedSearch, signal),
        queryHashSearchCandidate(execRawReadonly, search, branches, pathFilter, filters, signal),
    ]);
    const directHashMatches = hashCandidates.filter((commit) => commitMatchesSearch(commit, normalizedSearch))
        .map((commit) => markSearchMatch(commit, true));
    const commits = uniqueGraphCommits([
        ...directHashMatches,
        ...messageMatches,
    ]);
    return commits.slice(0, maxCount);
}

async function queryMessageSearchMatches(
    execRawReadonly: GitExec,
    maxCount: number,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    search: string,
    normalizedSearch: string,
    signal?: AbortSignal,
): Promise<GitGraphCommit[]> {
    const matches: GitGraphCommit[] = [];
    const seen = new Set<string>();
    const batchSize = Math.max(maxCount, Math.min(maxCount * 2, 1000));
    const escapedSearch = escapeGitRegex(search);
    let skippedCandidates = Math.max(0, Math.floor(filters.skip ?? 0));

    while (matches.length < maxCount) {
        signal?.throwIfAborted();
        const candidates = await queryGraphLogVariant(execRawReadonly, batchSize, branches, pathFilter, filters, [
            '--basic-regexp',
            '--regexp-ignore-case',
            `--grep=${escapedSearch}`,
        ], signal, skippedCandidates);
        for (const commit of candidates) {
            if (seen.has(commit.hash) || !commitMatchesSearch(commit, normalizedSearch)) { continue; }
            seen.add(commit.hash);
            matches.push(markSearchMatch(commit, true));
            if (matches.length >= maxCount) { break; }
        }
        skippedCandidates += candidates.length;
        if (candidates.length < batchSize) { break; }
    }

    return matches;
}

async function queryGraphLogVariant(
    execRawReadonly: GitExec,
    maxCount: number,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    extraArgs: readonly string[],
    signal?: AbortSignal,
    skipOverride?: number,
): Promise<GitGraphCommit[]> {
    const { args, usesDefaultRefs } = buildGraphLogArgs(maxCount, branches, pathFilter, filters, {
        extraArgs,
        skip: skipOverride ?? filters.skip,
    });
    return parseGraphLog(await execGraphLog(execRawReadonly, args, usesDefaultRefs, signal));
}

async function queryHashSearchCandidate(
    execRawReadonly: GitExec,
    search: string,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    signal?: AbortSignal,
): Promise<GitGraphCommit[]> {
    if (!isHashLikeSearch(search)) { return []; }
    const args = ['log', '--parents', `--format=${LOG_FORMAT}`, '--max-count=1', '--topo-order', `${search}^{commit}`];
    try {
        const commits = parseGraphLog(await execRawReadonly(args, signal));
        const commit = commits[0];
        if (!commit) { return []; }
        return await hashCandidateMatchesContext(execRawReadonly, commit, branches, pathFilter, filters, signal)
            ? [commit]
            : [];
    } catch (error) {
        if (isMissingRevisionError(error)) { return []; }
        throw error;
    }
}

async function hashCandidateMatchesContext(
    execRawReadonly: GitExec,
    commit: GitGraphCommit,
    branches: readonly string[] | undefined,
    pathFilter: string | undefined,
    filters: GraphLogFilters,
    signal?: AbortSignal,
): Promise<boolean> {
    if (filters.skip && filters.skip > 0) { return false; }
    if (branches?.length) {
        const reachable = await commitReachableFromAnyRef(execRawReadonly, commit.hash, branches, signal);
        if (!reachable) { return false; }
    }

    if (!pathFilter && !filters.authors?.length && !filters.dateFrom && !filters.dateTo) {
        return true;
    }

    const args = ['log', '--format=%H', '--max-count=1'];
    if (filters.dateFrom) { args.push(`--since=${filters.dateFrom}T00:00:00`); }
    if (filters.dateTo)   { args.push(`--until=${filters.dateTo}T23:59:59`); }
    for (const author of filters.authors ?? []) { args.push(`--author=${author}`); }
    args.push(commit.hash);
    if (pathFilter) { args.push('--', pathFilter); }
    const output = await execRawReadonly(args, signal);
    return output.trim().split(/\s+/)[0] === commit.hash;
}

async function commitReachableFromAnyRef(
    execRawReadonly: GitExec,
    commitHash: string,
    refs: readonly string[],
    signal?: AbortSignal,
): Promise<boolean> {
    for (const ref of refs) {
        signal?.throwIfAborted();
        try {
            await execRawReadonly(['merge-base', '--is-ancestor', commitHash, ref], signal);
            return true;
        } catch (error) {
            if (isMissingRevisionError(error)) { throw error; }
        }
    }
    return false;
}

function uniqueGraphCommits(commits: readonly GitGraphCommit[]): GitGraphCommit[] {
    const seen = new Set<string>();
    const unique: GitGraphCommit[] = [];
    for (const commit of commits) {
        if (seen.has(commit.hash)) { continue; }
        seen.add(commit.hash);
        unique.push(commit);
    }
    return unique;
}

function markSearchMatch(commit: GitGraphCommit, matchesFilter: boolean): GitGraphCommit {
    return commit.matchesFilter === matchesFilter ? commit : { ...commit, matchesFilter };
}

function escapeGitRegex(value: string): string {
    return value.replace(/[.[\]\\*^$]/g, '\\$&');
}

function isHashLikeSearch(search: string): boolean {
    return /^[0-9a-f]{4,40}$/i.test(search);
}

function isMissingRevisionError(error: unknown): boolean {
    const text = gitErrorText(error).toLowerCase();
    return text.includes('unknown revision')
        || text.includes('bad revision')
        || text.includes('needed a single revision')
        || text.includes('ambiguous argument');
}

function isUnbornCommitHistoryError(error: unknown, ref: string | undefined): boolean {
    const text = gitErrorText(error).toLowerCase();
    if (text.includes('does not have any commits yet')) { return true; }
    if (ref && ref.toUpperCase() !== 'HEAD') { return false; }
    return isUnbornHeadHistoryError(error);
}

function isUnbornHeadHistoryError(error: unknown): boolean {
    const text = gitErrorText(error).toLowerCase();
    return text.includes("ambiguous argument 'head'")
        && text.includes('unknown revision or path not in the working tree');
}

function gitErrorText(error: unknown): string {
    return [
        error instanceof Error ? error.message : String(error),
        stringErrorProperty(error, 'stderr'),
        stringErrorProperty(error, 'stdout'),
    ].filter((part) => part.length > 0).join('\n');
}

function stringErrorProperty(error: unknown, propertyName: 'stderr' | 'stdout'): string {
    if (typeof error !== 'object' || error === null) { return ''; }
    const descriptor = Object.getOwnPropertyDescriptor(error, propertyName);
    const value: unknown = descriptor?.value;
    return typeof value === 'string' ? value : '';
}

function commitMatchesSearch(commit: GitGraphCommit, search: string): boolean {
    return commit.message.toLowerCase().includes(search)
        || commit.hash.toLowerCase().includes(search)
        || commit.shortHash.toLowerCase().includes(search);
}
