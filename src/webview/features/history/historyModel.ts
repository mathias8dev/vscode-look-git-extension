import type { HistoryCommit } from '../../../protocol/history/types';

export function filterHistoryCommits(commits: readonly HistoryCommit[], query: string): readonly HistoryCommit[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) { return commits; }
    return commits.filter((commit) => [
        commit.hash,
        commit.shortHash,
        commit.message,
        commit.authorName,
        commit.authorDate,
    ].some((value) => value.toLowerCase().includes(normalized)));
}

export function selectedHistoryCommit(commits: readonly HistoryCommit[], selectedHash: string | undefined): HistoryCommit | undefined {
    return commits.find((commit) => commit.hash === selectedHash);
}

export function formatHistoryDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) { return iso; }
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function historyEmptyLabel(commits: readonly HistoryCommit[], query: string): string {
    if (commits.length === 0) { return 'No commits'; }
    return query.trim() ? 'No matching commits' : 'No commits';
}
