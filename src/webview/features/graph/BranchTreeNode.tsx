import { useState } from 'react';
import type { BranchInfo } from '../../../protocol/graph/types';
import type { BranchNode } from './graphBranchTree';

interface BranchTreeNodeProps {
    readonly node: BranchNode;
    readonly depth: number;
    readonly selectedBranch: string | undefined;
    readonly onSelect: (fullName: string) => void;
    readonly onOpenContextMenu: (branch: BranchInfo, x: number, y: number) => void;
}

export function BranchTreeNode({ node, depth, selectedBranch, onSelect, onOpenContextMenu }: BranchTreeNodeProps) {
    const [collapsed, setCollapsed] = useState(false);

    if (node.isFolder || node.children.length > 0) {
        return (
            <div className="branch-folder">
                <button
                    type="button"
                    className="branch-node branch-folder-header"
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
                    onClick={() => setCollapsed(!collapsed)}
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
                        onSelect={onSelect}
                        onOpenContextMenu={onOpenContextMenu}
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
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={node.fullName}
            onClick={() => onSelect(node.fullName)}
            onContextMenu={(event) => {
                if (!branch) { return; }
                event.preventDefault();
                onOpenContextMenu(branch, event.clientX, event.clientY);
            }}
        >
            <i
                className={`codicon ${isCurrent ? 'codicon-star-full' : 'codicon-git-branch'} branch-leaf-icon`}
                aria-hidden="true"
            />
            <span className="branch-node-name">{node.name}</span>
            {isCurrent && <span className="branch-current-indicator" aria-label="current branch" />}
            {branch?.ahead ? <span className="branch-ahead" title={`${branch.ahead} ahead`}>↑{branch.ahead}</span> : null}
            {branch?.behind ? <span className="branch-behind" title={`${branch.behind} behind`}>↓{branch.behind}</span> : null}
        </button>
    );
}
