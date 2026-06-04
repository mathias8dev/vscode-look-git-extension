import { useState } from 'react';
import type { BranchInfo } from '../../../protocol/graph/types';
import type { BranchNode } from './graphBranchTree';

export interface BranchTreeExpansionRequest {
    readonly mode: 'expanded' | 'collapsed';
    readonly version: number;
}

interface BranchTreeNodeProps {
    readonly node: BranchNode;
    readonly depth: number;
    readonly selectedBranch: string | undefined;
    readonly expansionRequest: BranchTreeExpansionRequest;
    readonly onSelect: (fullName: string) => void;
    readonly onOpenContextMenu: (branch: BranchInfo) => void;
    readonly contextForBranch: (branch: BranchInfo) => Record<string, unknown>;
}

export function BranchTreeNode({ node, depth, selectedBranch, expansionRequest, onSelect, onOpenContextMenu, contextForBranch }: BranchTreeNodeProps) {
    const [localCollapse, setLocalCollapse] = useState<{ readonly version: number; readonly collapsed: boolean }>();
    const collapsed = localCollapse?.version === expansionRequest.version
        ? localCollapse.collapsed
        : expansionRequest.mode === 'collapsed';

    if (node.isFolder || node.children.length > 0) {
        return (
            <div className="branch-folder">
                <button
                    type="button"
                    className="branch-node branch-folder-header"
                    style={{ paddingLeft: `${10 + depth * 14}px` }}
                    onClick={() => setLocalCollapse({ version: expansionRequest.version, collapsed: !collapsed })}
                >
                    <i
                        className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} branch-chevron`}
                        aria-hidden="true"
                    />
                    <i className="codicon codicon-folder branch-folder-icon" aria-hidden="true" />
                    <span className="branch-node-name">{node.name}</span>
                </button>
                {!collapsed && node.children.map((child) => (
                    <BranchTreeNode
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        selectedBranch={selectedBranch}
                        expansionRequest={expansionRequest}
                        onSelect={onSelect}
                        onOpenContextMenu={onOpenContextMenu}
                        contextForBranch={contextForBranch}
                    />
                ))}
            </div>
        );
    }

    const branch = node.branch;
    const isActive = selectedBranch === node.fullName;
    const isCurrent = branch?.isCurrent ?? false;

    return (
        <button
            type="button"
            className={`branch-node branch-leaf${isActive ? ' branch-node-active' : ''}`}
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            title={node.fullName}
            data-vscode-context={branch ? JSON.stringify(contextForBranch(branch)) : undefined}
            onClick={() => onSelect(node.fullName)}
            onContextMenu={() => {
                if (!branch) { return; }
                onOpenContextMenu(branch);
            }}
        >
            <i
                className={`codicon ${isCurrent ? 'codicon-star-full' : 'codicon-git-branch'} branch-leaf-icon`}
                aria-hidden="true"
            />
            <span className="branch-node-name">{node.name}</span>
            {isCurrent && <span className="branch-current-indicator" aria-label="current branch" />}
            {branch?.ahead ? (
                <span
                    className="branch-tracking-indicator branch-ahead"
                    title={notPushedTitle(branch.ahead)}
                    aria-label={notPushedTitle(branch.ahead)}
                >
                    <i className="codicon codicon-cloud-upload" aria-hidden="true" />
                    <span>{branch.ahead}</span>
                </span>
            ) : null}
            {branch?.behind ? (
                <span
                    className="branch-tracking-indicator branch-behind"
                    title={toPullTitle(branch.behind)}
                    aria-label={toPullTitle(branch.behind)}
                >
                    <i className="codicon codicon-cloud-download" aria-hidden="true" />
                    <span>{branch.behind}</span>
                </span>
            ) : null}
        </button>
    );
}

function notPushedTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} not pushed`;
}

function toPullTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} to pull`;
}
