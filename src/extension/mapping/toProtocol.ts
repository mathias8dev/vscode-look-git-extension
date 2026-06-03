// Mapping functions: Git-prefix core types → protocol types (webview-facing)
import type { GitGraphCommit } from '../../core/git/domain/GitCommit';
import type { GitBranch } from '../../core/git/domain/GitStatus';
import type { GitWorktree, GitSubmodule } from '../../core/git/domain/GitWorktree';
import { RepoKind, type RepoContext } from '../../core/git/domain/RepoContext';
import type { BranchInfo, GraphCommit, GraphSubmoduleInfo, WorktreeInfo } from '../../protocol/graph/types';
import { SubmoduleStatus, type SerializedRepoContext } from '../../protocol/shared/repo';

export function toProtocolGraphCommit(commit: GitGraphCommit): GraphCommit {
    return {
        hash: commit.hash,
        shortHash: commit.shortHash,
        message: commit.message,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        authorDate: commit.authorDate,
        parentHashes: commit.parentHashes,
        refs: commit.refs,
        matchesFilter: commit.matchesFilter,
    };
}

export function toProtocolBranch(b: GitBranch): BranchInfo {
    return {
        name: b.name,
        isRemote: b.isRemote,
        isCurrent: b.isCurrent,
        hash: b.hash,
        upstream: b.upstream,
        ahead: b.ahead || undefined,
        behind: b.behind || undefined,
    };
}

export function toProtocolWorktree(w: GitWorktree): WorktreeInfo {
    return {
        path: w.path,
        head: w.head,
        branch: w.branch,
        isMain: w.isMain,
        isDetached: w.isDetached,
        isLocked: w.isLocked,
        lockReason: w.lockReason,
    };
}

export function toProtocolGraphSubmodule(
    submodule: {
        readonly path: string;
        readonly status: GitSubmodule['status'];
        readonly branches: readonly GitBranch[];
        readonly worktrees: readonly GitWorktree[];
    },
): GraphSubmoduleInfo {
    return {
        path: submodule.path,
        name: submodule.path.split(/[\\/]/).at(-1) ?? submodule.path,
        status: toProtocolSubmoduleStatus(submodule.status),
        branches: submodule.branches.map(toProtocolBranch),
        worktrees: submodule.worktrees.map(toProtocolWorktree),
    };
}

export function toProtocolSubmoduleStatus(status: GitSubmodule['status']): SubmoduleStatus {
    const statusMap: Record<GitSubmodule['status'], SubmoduleStatus> = {
        ' ': SubmoduleStatus.Clean,
        '+': SubmoduleStatus.OutOfSync,
        '-': SubmoduleStatus.NotInitialized,
        'U': SubmoduleStatus.Dirty,
    };
    return statusMap[status];
}

export function toSerializedRepoContext(context: RepoContext): SerializedRepoContext {
    return {
        id: context.id,
        cwd: context.cwd,
        kind: toSerializedRepoKind(context.kind),
        parentId: context.parentId,
        label: context.label,
    };
}

function toSerializedRepoKind(kind: RepoKind): SerializedRepoContext['kind'] {
    switch (kind) {
        case RepoKind.Main: return 'main';
        case RepoKind.Worktree: return 'worktree';
        case RepoKind.Submodule: return 'submodule';
    }
}
