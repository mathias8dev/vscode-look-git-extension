import { useState } from 'react';
import type { BranchInfo, GraphContextTarget, WorktreeInfo } from '../../../protocol/graph/types';
import { buildBranchTree, buildRemoteBranchTree } from './graphBranchTree';
import { BranchTreeNode } from './BranchTreeNode';
import { IconButton } from '../../shared/IconButton';
import { selectBranchFilter } from './graphBranchSelection';

interface BranchPanelProps {
    readonly branches: readonly BranchInfo[];
    readonly worktrees: readonly WorktreeInfo[];
    readonly currentBranch: string;
    readonly selectedBranchFilter: string | undefined;
    readonly selectedWorktreePath: string | undefined;
    readonly onSelectBranch: (branch: string | undefined) => void;
    readonly onSelectWorktree: (path: string) => void;
    readonly onOpenWorktree: (path: string) => void;
    readonly onAddWorktree: () => void;
    readonly onContextTarget: (target: GraphContextTarget) => void;
}

export function BranchPanel({
    branches,
    worktrees,
    currentBranch,
    selectedBranchFilter,
    selectedWorktreePath,
    onSelectBranch,
    onSelectWorktree,
    onOpenWorktree,
    onAddWorktree,
    onContextTarget,
}: BranchPanelProps) {
    const [search, setSearch] = useState('');
    const [localCollapsed, setLocalCollapsed] = useState(false);
    const [remoteCollapsed, setRemoteCollapsed] = useState(false);
    const [worktreesCollapsed, setWorktreesCollapsed] = useState(false);

    const filtered = search
        ? branches.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
        : branches;

    const localBranches = filtered.filter((b) => !b.isRemote);
    const remoteBranches = filtered.filter((b) => b.isRemote);
    const localTree = buildBranchTree(localBranches);
    const remoteTree = buildRemoteBranchTree(remoteBranches);

    const handleSelect = (fullName: string) => {
        onSelectBranch(selectBranchFilter(fullName, selectedBranchFilter));
    };

    const branchWorktreeFor = (branch: BranchInfo): WorktreeInfo | undefined =>
        branch.isRemote ? undefined : worktrees.find((worktree) => shortWorktreeBranch(worktree.branch) === branch.name);

    const branchContextFor = (branch: BranchInfo): Record<string, unknown> => {
        const branchWorktree = branchWorktreeFor(branch);
        return {
            webviewSection: 'graphBranch',
            graphBranchIsRemote: branch.isRemote,
            graphBranchIsCurrent: branch.isCurrent,
            graphBranchHasWorktree: branchWorktree !== undefined,
            graphBranchWorktreeIsMain: branchWorktree?.isMain === true,
            graphBranchWorktreeIsLocked: branchWorktree?.isLocked === true,
            preventDefaultContextMenuItems: true,
        };
    };

    const handleOpenContextMenu = (branch: BranchInfo) => {
        onContextTarget({
            kind: 'branch',
            branch: branch.name,
            isRemote: branch.isRemote,
        });
    };

    const handleWorktreeContextTarget = (worktree: WorktreeInfo) => {
        onSelectWorktree(worktree.path);
        onContextTarget({ kind: 'worktree', path: worktree.path });
    };

    return (
        <div className="graph-branch-panel">
            <div className="branch-search">
                <div className="branch-search-wrapper">
                    <i className="codicon codicon-search branch-search-icon" aria-hidden="true" />
                    <input
                        type="search"
                        className="branch-search-input"
                        value={search}
                        placeholder="Branch or tag"
                        aria-label="Search branches"
                        onChange={(e) => setSearch(e.currentTarget.value)}
                    />
                </div>
            </div>

            <div className="branch-list">
                {localTree.length > 0 && (
                    <div className="branch-group">
                        <button
                            type="button"
                            className="branch-group-header"
                            onClick={() => setLocalCollapsed(!localCollapsed)}
                        >
                            <i
                                className={`codicon codicon-chevron-${localCollapsed ? 'right' : 'down'}`}
                                aria-hidden="true"
                            />
                            <span>Local</span>
                        </button>
                        {!localCollapsed && (
                            <>
                                <div className="branch-node branch-head-item">
                                    <i className="codicon codicon-git-commit branch-leaf-icon" aria-hidden="true" />
                                    <span className="branch-node-name">HEAD (Current Branch)</span>
                                    <span className="branch-current-name">{currentBranch}</span>
                                </div>
                                {localTree.map((node) => (
                                    <BranchTreeNode
                                        key={node.id}
                                        node={node}
                                        depth={1}
                                        selectedBranch={selectedBranchFilter}
                                        onSelect={handleSelect}
                                        onOpenContextMenu={handleOpenContextMenu}
                                        contextForBranch={branchContextFor}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                )}

                {remoteTree.length > 0 && (
                    <div className="branch-group">
                        <button
                            type="button"
                            className="branch-group-header"
                            onClick={() => setRemoteCollapsed(!remoteCollapsed)}
                        >
                            <i
                                className={`codicon codicon-chevron-${remoteCollapsed ? 'right' : 'down'}`}
                                aria-hidden="true"
                            />
                            <span>Remote</span>
                        </button>
                        {!remoteCollapsed && remoteTree.map((node) => (
                            <BranchTreeNode
                                key={node.id}
                                node={node}
                                depth={1}
                                selectedBranch={selectedBranchFilter}
                                onSelect={handleSelect}
                                onOpenContextMenu={handleOpenContextMenu}
                                contextForBranch={branchContextFor}
                            />
                        ))}
                    </div>
                )}

                <div className="branch-group">
                    <div className="graph-group-header-row">
                        <button
                            type="button"
                            className="branch-group-header"
                            onClick={() => setWorktreesCollapsed(!worktreesCollapsed)}
                        >
                            <i
                                className={`codicon codicon-chevron-${worktreesCollapsed ? 'right' : 'down'}`}
                                aria-hidden="true"
                            />
                            <span>Worktrees</span>
                            <span className="graph-resource-count">{worktrees.length}</span>
                        </button>
                        <IconButton
                            icon="add"
                            title="Add worktree"
                            className="graph-resource-action"
                            onClick={onAddWorktree}
                        />
                    </div>
                    {!worktreesCollapsed && worktrees.map((worktree) => (
                        <div
                            className="graph-resource-row graph-resource-row-clickable"
                            key={worktree.path}
                            role="button"
                            tabIndex={0}
                            aria-selected={worktree.path === selectedWorktreePath}
                            data-vscode-context={JSON.stringify({
                                webviewSection: 'graphWorktree',
                                graphWorktreeIsMain: worktree.isMain,
                                graphWorktreeIsLocked: worktree.isLocked,
                                preventDefaultContextMenuItems: true,
                            })}
                            onClick={() => onSelectWorktree(worktree.path)}
                            onContextMenu={() => handleWorktreeContextTarget(worktree)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onSelectWorktree(worktree.path);
                                }
                            }}
                        >
                            <i className="codicon codicon-repo branch-leaf-icon" aria-hidden="true" />
                            <span className="branch-node-name" title={worktree.path}>
                                {shortWorktreeBranch(worktree.branch) ?? `detached ${worktree.head.substring(0, 7)}`}
                            </span>
                            {worktree.isMain ? <span className="graph-resource-badge">main</span> : null}
                            {worktree.isLocked ? <span className="graph-resource-badge" title={worktree.lockReason}>locked</span> : null}
                            <IconButton
                                icon="go-to-file"
                                title="Open worktree"
                                className="graph-resource-action"
                                onClick={(e) => { e.stopPropagation(); onOpenWorktree(worktree.path); }}
                            />
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}
