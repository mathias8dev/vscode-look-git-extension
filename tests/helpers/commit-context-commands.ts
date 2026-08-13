import type { CommitCommand } from '@protocol/graph/messages';

export const COMMIT_CONTEXT_COMMANDS = [
    'copyRevisionNumber',
    'createPatch',
    'explainDiff',
    'cherryPick',
    'checkoutRevision',
    'showRepositoryAtRevision',
    'compareWithLocal',
    'newWorktreeFromCommit',
    'compareCommitWithWorktree',
    'resetCurrentBranchToHere',
    'revertCommit',
    'undoCommit',
    'editCommitMessage',
    'fixup',
    'squashInto',
    'dropCommit',
    'interactiveRebaseFromHere',
    'pushAllUpToHere',
    'newBranch',
    'newTag',
] as const satisfies readonly CommitCommand[];

export const COMMIT_CONTEXT_ACTIONS = [
    ...COMMIT_CONTEXT_COMMANDS,
    'goToChildCommit',
    'goToParentCommit',
] as const;

export function commitContextActionIds(prefix: string): readonly string[] {
    return COMMIT_CONTEXT_ACTIONS.map((command) => `${prefix}.${command}`);
}
