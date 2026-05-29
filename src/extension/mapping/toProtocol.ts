// Mapping functions: Git-prefix core types → protocol types (webview-facing)
import type { GitGraphCommit } from '../../core/git/domain/GitCommit';
import type { GitBranch } from '../../core/git/domain/GitStatus';
import type { GitWorktree, GitSubmodule } from '../../core/git/domain/GitWorktree';
import type { BranchInfo, GraphCommit, WorktreeInfo, SubmoduleInfo, SubmoduleStatus } from '../../protocol/graph/types';

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
    };
}

/** Maps raw git submodule status char to human-readable protocol status. */
export function toProtocolSubmodule(s: GitSubmodule): SubmoduleInfo {
    const statusMap: Record<GitSubmodule['status'], SubmoduleStatus> = {
        ' ': 'clean',
        '+': 'out-of-sync',
        '-': 'not-initialized',
        'U': 'dirty',
    };
    return {
        path: s.path,
        name: s.path.split('/').pop() ?? s.path,
        url: '',           // populated by the caller from .gitmodules if needed
        registeredHash: '', // populated by the caller via git ls-files -s
        status: statusMap[s.status],
    };
}
