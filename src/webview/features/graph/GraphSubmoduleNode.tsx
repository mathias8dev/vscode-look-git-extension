import { useState } from 'react';
import { SubmoduleStatus } from '../../../protocol/shared/repo';
import type { GraphSubmoduleInfo } from '../../../protocol/graph/types';
import { buildBranchTree, buildRemoteBranchTree } from './graphBranchTree';
import type { BranchTreeExpansionRequest } from './BranchTreeNode';
import { SubmoduleBranchTreeNode } from './SubmoduleBranchTreeNode';
import { SubmoduleWorktreeRow } from './SubmoduleWorktreeRow';

interface GraphSubmoduleNodeProps {
    readonly submodule: GraphSubmoduleInfo;
    readonly selectedSubmodulePath: string | undefined;
    readonly selectedBranch: string | undefined;
    readonly expansionRequest: BranchTreeExpansionRequest;
    readonly forceExpanded: boolean;
    readonly onSelectBranch: (submodulePath: string, submoduleLabel: string, branch: string) => void;
}

export function GraphSubmoduleNode({
    submodule,
    selectedSubmodulePath,
    selectedBranch,
    expansionRequest,
    forceExpanded,
    onSelectBranch,
}: GraphSubmoduleNodeProps) {
    const [collapsed, setCollapsed] = useState(true);
    const expanded = forceExpanded || !collapsed;
    const localTree = buildBranchTree(submodule.branches.filter((branch) => !branch.isRemote));
    const remoteTree = buildRemoteBranchTree(submodule.branches.filter((branch) => branch.isRemote));

    return (
        <div className="graph-submodule-node">
            <button
                type="button"
                className="graph-resource-row graph-resource-row-clickable graph-submodule-row"
                aria-expanded={expanded}
                title={submodule.path}
                onClick={() => setCollapsed(!collapsed)}
            >
                <i
                    className={`codicon codicon-chevron-${expanded ? 'down' : 'right'} branch-chevron`}
                    aria-hidden="true"
                />
                <i className="codicon codicon-file-submodule branch-leaf-icon" aria-hidden="true" />
                <span className="branch-node-name">{submodule.name}</span>
                <span
                    className={`graph-submodule-status graph-submodule-status-${submodule.status}`}
                    title={statusLabel(submodule.status)}
                >
                    {statusLabel(submodule.status)}
                </span>
                <span className="graph-resource-badge" title={`${submodule.branches.length} branches`}>
                    {submodule.branches.length}b
                </span>
                <span className="graph-resource-badge" title={`${submodule.worktrees.length} worktrees`}>
                    {submodule.worktrees.length}w
                </span>
            </button>

            {expanded ? (
                <div className="graph-submodule-details">
                    {localTree.length > 0 ? (
                        <div className="graph-submodule-detail-group">
                            <div className="graph-submodule-detail-title">Local</div>
                            {localTree.map((node) => (
                                <SubmoduleBranchTreeNode
                                    key={node.id}
                                    node={node}
                                    depth={2}
                                    submodulePath={submodule.path}
                                    selectedSubmodulePath={selectedSubmodulePath}
                                    selectedBranch={selectedBranch}
                                    expansionRequest={expansionRequest}
                                    onSelectBranch={(submodulePath, branch) => onSelectBranch(submodulePath, submodule.name, branch)}
                                />
                            ))}
                        </div>
                    ) : null}

                    {remoteTree.length > 0 ? (
                        <div className="graph-submodule-detail-group">
                            <div className="graph-submodule-detail-title">Remote</div>
                            {remoteTree.map((node) => (
                                <SubmoduleBranchTreeNode
                                    key={node.id}
                                    node={node}
                                    depth={2}
                                    submodulePath={submodule.path}
                                    selectedSubmodulePath={selectedSubmodulePath}
                                    selectedBranch={selectedBranch}
                                    expansionRequest={expansionRequest}
                                    onSelectBranch={(submodulePath, branch) => onSelectBranch(submodulePath, submodule.name, branch)}
                                />
                            ))}
                        </div>
                    ) : null}

                    {submodule.worktrees.length > 0 ? (
                        <div className="graph-submodule-detail-group">
                            <div className="graph-submodule-detail-title">Worktrees</div>
                            {submodule.worktrees.map((worktree) => (
                                <SubmoduleWorktreeRow key={worktree.path} worktree={worktree} />
                            ))}
                        </div>
                    ) : null}

                    {submodule.branches.length === 0 && submodule.worktrees.length === 0 ? (
                        <div className="graph-submodule-empty">
                            {submodule.status === SubmoduleStatus.NotInitialized ? 'Not initialized' : 'No branches or worktrees'}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function statusLabel(status: SubmoduleStatus): string {
    switch (status) {
        case SubmoduleStatus.Clean: return 'clean';
        case SubmoduleStatus.Dirty: return 'dirty';
        case SubmoduleStatus.OutOfSync: return 'out-of-sync';
        case SubmoduleStatus.NotInitialized: return 'not init';
    }
}
