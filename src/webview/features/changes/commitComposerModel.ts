import { CommitMode, ConflictState } from '@protocol/changes/types';

export type ConventionalCommitType =
    | ''
    | 'feat'
    | 'fix'
    | 'docs'
    | 'style'
    | 'refactor'
    | 'perf'
    | 'test'
    | 'build'
    | 'ci'
    | 'chore';

export interface CommitAvailabilityInput {
    readonly message: string;
    readonly mode: CommitMode;
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
}

export interface CommitModeOption {
    readonly mode: CommitMode;
    readonly label: string;
    readonly primary?: boolean;
}

export interface CommitMessageParts {
    readonly type: ConventionalCommitType;
    readonly scope: string;
    readonly message: string;
}

export interface CommitMessageStats {
    readonly characters: number;
    readonly lines: number;
}

export const COMMIT_MODE_OPTIONS: readonly CommitModeOption[] = [
    { mode: CommitMode.Commit, label: 'Commit', primary: true },
    { mode: CommitMode.Amend, label: 'Amend' },
    { mode: CommitMode.CommitPush, label: 'Commit & Push' },
    { mode: CommitMode.CommitSync, label: 'Commit & Sync' },
];

export const CONVENTIONAL_COMMIT_TYPES: readonly ConventionalCommitType[] = [
    '',
    'feat',
    'fix',
    'docs',
    'style',
    'refactor',
    'perf',
    'test',
    'build',
    'ci',
    'chore',
];

export function canSubmitCommit(input: CommitAvailabilityInput): boolean {
    return commitBlockReason(input) === undefined;
}

export function commitBlockReason(input: CommitAvailabilityInput): string | undefined {
    if (input.conflictState !== ConflictState.None) { return 'Resolve conflicts before committing.'; }
    if (input.message.trim().length === 0) { return 'Commit message required.'; }
    if (input.mode !== CommitMode.Amend && input.stagedCount === 0) { return 'Stage files before committing.'; }
    return undefined;
}

export function buildCommitMessage(parts: CommitMessageParts): string {
    const message = parts.message.trim();
    if (!message || !parts.type) { return message; }

    const [firstLine = '', ...rest] = message.split(/\r?\n/);
    const scope = parts.scope.trim();
    const prefix = scope ? `${parts.type}(${scope}): ` : `${parts.type}: `;
    return [prefix + firstLine, ...rest].join('\n');
}

export function messageStats(message: string): CommitMessageStats {
    return {
        characters: message.length,
        lines: message.length === 0 ? 0 : message.split(/\r?\n/).length,
    };
}

export function rememberCommitMessage(
    history: readonly string[],
    message: string,
    limit = 5,
): readonly string[] {
    const trimmed = message.trim();
    if (!trimmed) { return history; }
    return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, limit);
}
