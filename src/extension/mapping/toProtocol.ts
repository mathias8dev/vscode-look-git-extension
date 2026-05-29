// Mapping functions: Git-prefix core types → protocol types (webview-facing)
import type { GitBranch } from '../../core/git/domain/GitStatus';
import type { GitWorktree, GitSubmodule } from '../../core/git/domain/GitWorktree';
import type { BranchInfo, WorktreeInfo, SubmoduleInfo, SubmoduleStatus } from '../../protocol/graph/types';

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
