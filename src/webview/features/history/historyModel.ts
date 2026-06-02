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
        ...commit.refs.map((ref) => ref.name),
    ].some((value) => value.toLowerCase().includes(normalized)));
}

export function selectedHistoryCommit(commits: readonly HistoryCommit[], selectedHash: string | undefined): HistoryCommit | undefined {
    return commits.find((commit) => commit.hash === selectedHash);
}

export function formatHistoryDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) { return iso; }
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function formatRelativeDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) { return iso; }
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) { return 'just now'; }
    if (minutes < 60) { return `${minutes}m ago`; }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) { return `${hours}h ago`; }
    const days = Math.floor(hours / 24);
    if (days < 30) { return `${days}d ago`; }
    const months = Math.floor(days / 30);
    if (months < 12) { return `${months}mo ago`; }
    return `${Math.floor(months / 12)}y ago`;
}

export function parseCommitMessage(fullMessage: string): { subject: string; body: string } {
    const idx = fullMessage.indexOf('\n\n');
    if (idx === -1) { return { subject: fullMessage.trim(), body: '' }; }
    return { subject: fullMessage.slice(0, idx).trim(), body: fullMessage.slice(idx + 2).trim() };
}

export function historyEmptyLabel(commits: readonly HistoryCommit[], query: string): string {
    if (commits.length === 0) { return 'No commits'; }
    return query.trim() ? 'No matching commits' : 'No commits';
}
