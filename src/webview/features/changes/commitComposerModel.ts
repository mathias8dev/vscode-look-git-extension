import type { CommitMode, ConflictState } from '../../../protocol/changes/types';

export interface CommitAvailabilityInput {
    readonly message: string;
    readonly mode: CommitMode;
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
}

export interface CommitModeOption {
    readonly mode: CommitMode;
    readonly label: string;
}

export const COMMIT_MODE_OPTIONS: readonly CommitModeOption[] = [
    { mode: 'commit', label: 'Commit' },
    { mode: 'amend', label: 'Amend' },
    { mode: 'commitPush', label: 'Commit & Push' },
    { mode: 'commitSync', label: 'Commit & Sync' },
];

export function canSubmitCommit(input: CommitAvailabilityInput): boolean {
    return commitBlockReason(input) === undefined;
}

export function commitBlockReason(input: CommitAvailabilityInput): string | undefined {
    if (input.conflictState !== 'none') { return 'Resolve conflicts before committing.'; }
    if (input.message.trim().length === 0) { return 'Commit message required.'; }
    if (input.mode !== 'amend' && input.stagedCount === 0) { return 'Stage files before committing.'; }
    return undefined;
}
