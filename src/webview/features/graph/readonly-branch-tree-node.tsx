import { useState } from 'react';
import type { BranchNode } from '@webview/features/graph/graph-branch-tree';
import type { BranchTreeExpansionRequest } from '@webview/features/graph/branch-tree-node';

interface ReadonlyBranchTreeNodeProps {
    readonly node: BranchNode;
    readonly depth: number;
    readonly expansionRequest: BranchTreeExpansionRequest;
}

export function ReadonlyBranchTreeNode({ node, depth, expansionRequest }: ReadonlyBranchTreeNodeProps) {
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
                    <ReadonlyBranchTreeNode
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        expansionRequest={expansionRequest}
                    />
                ))}
            </div>
        );
    }

    const branch = node.branch;
    const isCurrent = branch?.isCurrent ?? false;

    return (
        <div
            className="branch-node branch-leaf graph-readonly-branch-row"
            style={{ paddingLeft: `${10 + depth * 14}px` }}
            title={node.fullName}
        >
            <i
                className={`codicon ${isCurrent ? 'codicon-star-full' : 'codicon-git-branch'} branch-leaf-icon`}
                aria-hidden="true"
            />
            <span className="branch-node-name">{node.name}</span>
            {isCurrent && <span className="branch-current-indicator" aria-label="current submodule branch" />}
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
        </div>
    );
}

function notPushedTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} not pushed`;
}

function toPullTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} to pull`;
}
