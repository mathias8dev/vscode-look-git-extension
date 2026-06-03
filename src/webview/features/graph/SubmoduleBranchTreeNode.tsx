import { useState } from 'react';
import type { BranchNode } from './graphBranchTree';
import type { BranchTreeExpansionRequest } from './BranchTreeNode';

interface SubmoduleBranchTreeNodeProps {
    readonly node: BranchNode;
    readonly depth: number;
    readonly submodulePath: string;
    readonly selectedSubmodulePath: string | undefined;
    readonly selectedBranch: string | undefined;
    readonly expansionRequest: BranchTreeExpansionRequest;
    readonly onSelectBranch: (submodulePath: string, branch: string) => void;
}

export function SubmoduleBranchTreeNode({
    node,
    depth,
    submodulePath,
    selectedSubmodulePath,
    selectedBranch,
    expansionRequest,
    onSelectBranch,
}: SubmoduleBranchTreeNodeProps) {
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
                    style={{ paddingLeft: `${8 + depth * 12}px` }}
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
                    <SubmoduleBranchTreeNode
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        submodulePath={submodulePath}
                        selectedSubmodulePath={selectedSubmodulePath}
                        selectedBranch={selectedBranch}
                        expansionRequest={expansionRequest}
                        onSelectBranch={onSelectBranch}
                    />
                ))}
            </div>
        );
    }

    const branch = node.branch;
    const isActive = selectedSubmodulePath === submodulePath && selectedBranch === node.fullName;
    const isCurrent = branch?.isCurrent ?? false;

    return (
        <button
            type="button"
            className={`branch-node branch-leaf graph-submodule-branch-row${isActive ? ' branch-node-active' : ''}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            title={node.fullName}
            onClick={() => onSelectBranch(submodulePath, node.fullName)}
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
        </button>
    );
}

function notPushedTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} not pushed`;
}

function toPullTitle(count: number): string {
    return `${count} commit${count === 1 ? '' : 's'} to pull`;
}
