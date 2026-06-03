import type { WorktreeInfo } from '../../../protocol/graph/types';

interface SubmoduleWorktreeRowProps {
    readonly worktree: WorktreeInfo;
}

export function SubmoduleWorktreeRow({ worktree }: SubmoduleWorktreeRowProps) {
    return (
        <div className="graph-resource-row graph-submodule-worktree-row" title={worktree.path}>
            <i className="codicon codicon-repo branch-leaf-icon" aria-hidden="true" />
            <span className="branch-node-name">
                {shortWorktreeBranch(worktree.branch) ?? `detached ${worktree.head.substring(0, 7)}`}
            </span>
            {worktree.isMain ? <span className="graph-resource-badge">main</span> : null}
            {worktree.isLocked ? <span className="graph-resource-badge" title={worktree.lockReason}>locked</span> : null}
        </div>
    );
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}
