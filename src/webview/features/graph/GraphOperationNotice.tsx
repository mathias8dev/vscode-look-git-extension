import {
    GraphOperationCategory,
    GraphOperationStatus,
    type GraphOperationStatusPush,
} from '../../../protocol/graph/messages';
import { OperationStatus } from '../../../protocol/shared/operation';
import { OperationNotice } from '../../shared/OperationNotice';

interface GraphOperationNoticeProps {
    readonly operation: GraphOperationStatusPush | undefined;
}

export function GraphOperationNotice({ operation }: GraphOperationNoticeProps) {
    if (!operation) { return null; }
    return (
        <OperationNotice
            status={operationStatus(operation.status)}
            message={operationText(operation)}
        />
    );
}

function operationStatus(status: GraphOperationStatus): OperationStatus {
    switch (status) {
        case GraphOperationStatus.Running:
            return OperationStatus.Running;
        case GraphOperationStatus.Success:
            return OperationStatus.Success;
        case GraphOperationStatus.Failed:
            return OperationStatus.Failed;
    }
}

function operationText(operation: GraphOperationStatusPush): string {
    const label = operationLabel(operation);
    switch (operation.status) {
        case GraphOperationStatus.Running:
            return operation.background ? `Starting ${label}...` : `${sentenceCase(label)}...`;
        case GraphOperationStatus.Success:
            return operation.background ? `${sentenceCase(label)} started.` : `${pastTense(label)}.`;
        case GraphOperationStatus.Failed:
            return `Could not ${label}.`;
    }
}

function operationLabel(operation: GraphOperationStatusPush): string {
    const target = operation.target ? ` ${shortTarget(operation.target)}` : '';
    switch (operation.category) {
        case GraphOperationCategory.Repository:
            return operation.command === 'fetch' ? 'fetch all remotes' : readableCommand(operation.command);
        case GraphOperationCategory.Branch:
            return branchOperationLabel(operation.command, target);
        case GraphOperationCategory.Worktree:
            return worktreeOperationLabel(operation.command, target);
        case GraphOperationCategory.Commit:
            return commitOperationLabel(operation.command, target);
    }
}

function branchOperationLabel(command: string, target: string): string {
    switch (command) {
        case 'checkout': return `checkout${target}`;
        case 'newBranchFrom': return `create branch from${target}`;
        case 'checkoutRebaseOnto': return `checkout and rebase${target}`;
        case 'newWorktreeFromBranch': return `create worktree from${target}`;
        case 'delete': return `delete${target}`;
        case 'rename': return `rename${target}`;
        case 'push': return `push${target}`;
        case 'update': return `update${target}`;
        case 'rebaseOnto': return `rebase onto${target}`;
        case 'mergeInto': return `merge${target}`;
        case 'pullBranchWorktree': return `pull worktree for${target}`;
        case 'pushBranchWorktree': return `push worktree for${target}`;
        case 'lockBranchWorktree': return `lock worktree for${target}`;
        case 'unlockBranchWorktree': return `unlock worktree for${target}`;
        case 'removeBranchWorktree': return `remove worktree for${target}`;
        default: return readableCommand(command) + target;
    }
}

function worktreeOperationLabel(command: string, target: string): string {
    switch (command) {
        case 'fetch': return `fetch worktree${target}`;
        case 'pull': return `pull worktree${target}`;
        case 'push': return `push worktree${target}`;
        case 'commit': return `commit worktree${target}`;
        case 'stash': return `stash worktree${target}`;
        case 'newBranch': return `create branch in worktree${target}`;
        case 'checkoutBranch': return `checkout branch in worktree${target}`;
        case 'lock': return `lock worktree${target}`;
        case 'unlock': return `unlock worktree${target}`;
        case 'add': return 'add worktree';
        case 'remove': return `remove worktree${target}`;
        case 'removeForce': return `force remove worktree${target}`;
        default: return readableCommand(command) + target;
    }
}

function commitOperationLabel(command: string, target: string): string {
    switch (command) {
        case 'cherryPick': return `cherry-pick${target}`;
        case 'checkoutRevision': return `checkout revision${target}`;
        case 'resetCurrentBranchToHere': return `reset current branch to${target}`;
        case 'revertCommit': return `revert${target}`;
        case 'undoCommit': return `undo commit${target}`;
        case 'editCommitMessage': return `edit commit message for${target}`;
        case 'fixup': return `fixup${target}`;
        case 'squashInto': return `squash commits${target}`;
        case 'dropCommit': return `drop${target}`;
        case 'interactiveRebaseFromHere': return `start interactive rebase from${target}`;
        case 'pushAllUpToHere': return `push commits up to${target}`;
        case 'newBranch': return `create branch from${target}`;
        case 'newTag': return `create tag at${target}`;
        case 'newWorktreeFromCommit': return `create worktree from${target}`;
        default: return readableCommand(command) + target;
    }
}

function pastTense(label: string): string {
    if (label.startsWith('fetch ')) { return sentenceCase(label.replace(/^fetch /, 'fetched ')); }
    if (label.startsWith('push ')) { return sentenceCase(label.replace(/^push /, 'pushed ')); }
    if (label.startsWith('pull ')) { return sentenceCase(label.replace(/^pull /, 'pulled ')); }
    if (label.startsWith('update ')) { return sentenceCase(label.replace(/^update /, 'updated ')); }
    if (label.startsWith('merge ')) { return sentenceCase(label.replace(/^merge /, 'merged ')); }
    if (label.startsWith('rebase ')) { return sentenceCase(label.replace(/^rebase /, 'rebased ')); }
    if (label.startsWith('checkout ')) { return sentenceCase(label.replace(/^checkout /, 'checked out ')); }
    if (label.startsWith('cherry-pick ')) { return sentenceCase(label.replace(/^cherry-pick /, 'cherry-picked ')); }
    if (label.startsWith('stash ')) { return sentenceCase(label.replace(/^stash /, 'stashed ')); }
    return `${sentenceCase(label)} completed`;
}

function sentenceCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function readableCommand(command: string): string {
    return command.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').toLowerCase();
}

function shortTarget(target: string): string {
    if (target.length <= 48) { return target; }
    return `${target.substring(0, 24)}...${target.substring(target.length - 16)}`;
}
