import { useState } from 'react';
import type { CSSProperties } from 'react';
import { GraphOperationCategory, GraphOperationStatus, type BranchCommand, type GraphOperationStatusPush } from '@protocol/graph/messages';
import type { BranchInfo, GraphContextTarget, GraphSubmoduleInfo, WorktreeInfo } from '@protocol/graph/types';
import { mainGraphRepositorySelection, type GraphRepositorySelection } from '@webview/features/graph/graphRepositorySelection';
import { buildBranchTree, buildRemoteBranchTree } from '@webview/features/graph/graphBranchTree';
import { BranchTreeNode, type BranchTreeExpansionRequest } from '@webview/features/graph/BranchTreeNode';
import { GraphSubmoduleNode } from '@webview/features/graph/GraphSubmoduleNode';
import { IconButton } from '@webview/shared/IconButton';
import { SearchInput } from '@webview/shared/SearchInput';
import { selectBranchFilter } from '@webview/features/graph/graphBranchSelection';

interface BranchPanelProps {
    readonly style?: CSSProperties;
    readonly branches: readonly BranchInfo[];
    readonly worktrees: readonly WorktreeInfo[];
    readonly submodules: readonly GraphSubmoduleInfo[];
    readonly selectedRepository?: GraphRepositorySelection;
    readonly currentBranch: string;
    readonly hasRemotes?: boolean;
    readonly selectedBranchFilter: string | undefined;
    readonly selectedWorktreePath: string | undefined;
    readonly operationStatus?: GraphOperationStatusPush;
    readonly onSelectBranch: (branch: string | undefined) => void;
    readonly onSelectMainRepository?: () => void;
    readonly onSelectSubmodule?: (submodule: GraphSubmoduleInfo) => void;
    readonly onBranchCommand: (command: BranchCommand, branch: string, isRemote: boolean) => void;
    readonly onFetch: () => void;
    readonly onSelectWorktree: (path: string) => void;
    readonly onOpenWorktree: (path: string) => void;
    readonly onAddWorktree: () => void;
    readonly onContextTarget: (target: GraphContextTarget) => void;
}

export function BranchPanel({
    style,
    branches,
    worktrees,
    submodules,
    selectedRepository = mainGraphRepositorySelection(),
    currentBranch,
    hasRemotes = false,
    selectedBranchFilter,
    selectedWorktreePath,
    operationStatus,
    onSelectBranch,
    onSelectMainRepository = () => undefined,
    onSelectSubmodule = () => undefined,
    onBranchCommand,
    onFetch,
    onSelectWorktree,
    onOpenWorktree,
    onAddWorktree,
    onContextTarget,
}: BranchPanelProps) {
    const [search, setSearch] = useState('');
    const [localCollapsed, setLocalCollapsed] = useState(false);
    const [remoteCollapsed, setRemoteCollapsed] = useState(false);
    const [worktreesCollapsed, setWorktreesCollapsed] = useState(false);
    const [submodulesCollapsed, setSubmodulesCollapsed] = useState(false);
    const [treeExpansionRequest, setTreeExpansionRequest] = useState<BranchTreeExpansionRequest>({
        mode: 'expanded',
        version: 0,
    });

    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
        ? branches.filter((b) => b.name.toLowerCase().includes(normalizedSearch))
        : branches;
    const filteredSubmodules = normalizedSearch
        ? submodules.filter((submodule) => submoduleMatchesSearch(submodule, normalizedSearch))
        : submodules;

    const localBranches = filtered.filter((b) => !b.isRemote);
    const remoteBranches = filtered.filter((b) => b.isRemote);
    const localTree = buildBranchTree(localBranches);
    const remoteTree = buildRemoteBranchTree(remoteBranches);
    const selectedBranch = selectedBranchFilter
        ? branches.find((branch) => branch.name === selectedBranchFilter)
        : undefined;
    const currentBranchInfo = branches.find((branch) => !branch.isRemote && branch.name === currentBranch) ?? {
        name: currentBranch,
        isRemote: false,
        isCurrent: true,
        hash: '',
    };
    const createBranchSource = selectedBranch ?? currentBranchInfo;
    const updateSelectedDisabled = !selectedBranch || selectedBranch.isRemote;
    const deleteSelectedDisabled = !selectedBranch || selectedBranch.isCurrent;
    const compareWithLocalDisabled = !selectedBranch || selectedBranch.isCurrent;
    const fetching = isRunningRepositoryOperation(operationStatus, 'fetch');
    const updatingSelected = isRunningBranchOperation(operationStatus, 'update', selectedBranch?.name);

    const handleSelect = (fullName: string) => {
        onSelectBranch(selectBranchFilter(fullName, selectedBranchFilter));
    };

    const runBranchCommand = (command: BranchCommand, branch: BranchInfo | undefined) => {
        if (!branch) { return; }
        onBranchCommand(command, branch.name, branch.isRemote);
    };

    const showCurrentBranch = () => {
        setSearch('');
        onSelectBranch(currentBranch);
    };

    const expandBranches = () => {
        setLocalCollapsed(false);
        setRemoteCollapsed(false);
        setTreeExpansionRequest((request) => ({ mode: 'expanded', version: request.version + 1 }));
    };

    const collapseBranches = () => {
        setLocalCollapsed(false);
        setRemoteCollapsed(false);
        setTreeExpansionRequest((request) => ({ mode: 'collapsed', version: request.version + 1 }));
    };

    const branchWorktreeFor = (branch: BranchInfo): WorktreeInfo | undefined =>
        branch.isRemote ? undefined : worktrees.find((worktree) => shortWorktreeBranch(worktree.branch) === branch.name);

    const branchContextFor = (branch: BranchInfo): Record<string, unknown> => {
        const branchWorktree = branchWorktreeFor(branch);
        const hasUpstream = Boolean(branch.upstream);
        const canPush = !branch.isRemote && hasUpstream;
        const canPublish = !branch.isRemote && !hasUpstream;
        const canDelete = !branch.isCurrent;
        const disabledReasons = branchDisabledReasons(branch, { canPush, canPublish, canDelete });
        return {
            webviewSection: 'graphBranch',
            graphBranchIsRemote: branch.isRemote,
            graphBranchIsCurrent: branch.isCurrent,
            graphBranchHasUpstream: hasUpstream,
            graphBranchCanPush: canPush,
            graphBranchCanPublish: canPublish,
            graphBranchCanDelete: canDelete,
            graphBranchHasWorktree: branchWorktree !== undefined,
            graphBranchWorktreeIsMain: branchWorktree?.isMain === true,
            graphBranchWorktreeIsLocked: branchWorktree?.isLocked === true,
            graphBranchDisabledReason: disabledReasons.join('\n'),
            preventDefaultContextMenuItems: true,
        };
    };

    const handleOpenContextMenu = (branch: BranchInfo) => {
        const hasUpstream = Boolean(branch.upstream);
        onContextTarget({
            kind: 'branch',
            branch: branch.name,
            isRemote: branch.isRemote,
            isCurrent: branch.isCurrent,
            hasUpstream,
            canPush: !branch.isRemote && hasUpstream,
            canPublish: !branch.isRemote && !hasUpstream,
            canDelete: !branch.isCurrent,
        });
    };

    const handleWorktreeContextTarget = (worktree: WorktreeInfo) => {
        onSelectWorktree(worktree.path);
        onContextTarget({ kind: 'worktree', path: worktree.path });
    };

    return (
        <div className="graph-branch-panel graph-scope-transition-surface" style={style}>
            <div className="graph-branch-panel-body">
                <div className="graph-branch-action-bar" aria-label="Branch actions">
                    <IconButton
                        icon="add"
                        title={`Create Branch from ${createBranchSource.name}`}
                        onClick={() => runBranchCommand('newBranchFrom', createBranchSource)}
                    />
                    <IconButton
                        icon="repo-pull"
                        title="Update Selected Branch"
                        disabled={updateSelectedDisabled}
                        busy={updatingSelected}
                        onClick={() => runBranchCommand('update', selectedBranch)}
                    />
                    <IconButton
                        icon="trash"
                        title="Delete Selected Branch"
                        disabled={deleteSelectedDisabled}
                        onClick={() => runBranchCommand('delete', selectedBranch)}
                    />
                    <IconButton
                        icon="arrow-swap"
                        title="Compare with Local"
                        disabled={compareWithLocalDisabled}
                        onClick={() => runBranchCommand('compareWithCurrent', selectedBranch)}
                    />
                    <IconButton
                        icon="search"
                        title="Show My Branch"
                        onClick={showCurrentBranch}
                    />
                    <IconButton
                        icon="git-fetch"
                        title="Fetch"
                        busy={fetching}
                        onClick={onFetch}
                    />
                    <span className="graph-branch-action-separator" aria-hidden="true" />
                    <IconButton
                        icon="expand-all"
                        title="Expand Branches"
                        onClick={expandBranches}
                    />
                    <IconButton
                        icon="collapse-all"
                        title="Collapse Branches"
                        onClick={collapseBranches}
                    />
                </div>

                <div className="graph-branch-content">
                    <div className="branch-search">
                        <SearchInput
                            value={search}
                            placeholder="Branch, worktree, submodule"
                            ariaLabel="Search branches, worktrees, and submodules"
                            onChange={setSearch}
                        />
                    </div>

                    <div className="branch-list">
                        {selectedRepository.kind === 'submodule' ? (
                            <button
                                type="button"
                                className="graph-resource-row graph-resource-row-clickable graph-scope-back-row"
                                title={`Show main repository from ${selectedRepository.path}`}
                                onClick={onSelectMainRepository}
                            >
                                <i className="codicon codicon-arrow-left branch-leaf-icon" aria-hidden="true" />
                                <span className="branch-node-name">Main repository</span>
                                <span className="graph-resource-badge">
                                    {selectedRepository.label}
                                </span>
                            </button>
                        ) : null}

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
                                                hasRemotes={hasRemotes}
                                                expansionRequest={treeExpansionRequest}
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
                                        hasRemotes={hasRemotes}
                                        expansionRequest={treeExpansionRequest}
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

                        {filteredSubmodules.length > 0 && (
                            <div className="branch-group">
                                <button
                                    type="button"
                                    className="branch-group-header"
                                    onClick={() => setSubmodulesCollapsed(!submodulesCollapsed)}
                                >
                                    <i
                                        className={`codicon codicon-chevron-${submodulesCollapsed ? 'right' : 'down'}`}
                                        aria-hidden="true"
                                    />
                                    <span>Submodules</span>
                                    <span className="graph-resource-count">{filteredSubmodules.length}</span>
                                </button>
                                {!submodulesCollapsed && filteredSubmodules.map((submodule) => (
                                    <GraphSubmoduleNode
                                        key={submodule.path}
                                        submodule={submodule}
                                        selectedSubmodulePath={selectedRepository.kind === 'submodule' ? selectedRepository.path : undefined}
                                        onSelectSubmodule={onSelectSubmodule}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function isRunningRepositoryOperation(operation: GraphOperationStatusPush | undefined, command: string): boolean {
    return operation?.status === GraphOperationStatus.Running
        && operation.category === GraphOperationCategory.Repository
        && operation.command === command;
}

function isRunningBranchOperation(operation: GraphOperationStatusPush | undefined, command: string, branch: string | undefined): boolean {
    return operation?.status === GraphOperationStatus.Running
        && operation.category === GraphOperationCategory.Branch
        && operation.command === command
        && operation.target === branch;
}

function shortWorktreeBranch(branch: string | undefined): string | undefined {
    return branch?.replace(/^refs\/heads\//, '');
}

function submoduleMatchesSearch(submodule: GraphSubmoduleInfo, normalizedSearch: string): boolean {
    return submodule.path.toLowerCase().includes(normalizedSearch)
        || submodule.name.toLowerCase().includes(normalizedSearch)
        || submodule.status.toLowerCase().includes(normalizedSearch)
        || submodule.branches.some((branch) => branch.name.toLowerCase().includes(normalizedSearch))
        || submodule.worktrees.some((worktree) => (
            worktree.path.toLowerCase().includes(normalizedSearch)
            || (worktree.branch?.toLowerCase().includes(normalizedSearch) ?? false)
        ));
}

function branchDisabledReasons(
    branch: BranchInfo,
    capabilities: {
        readonly canPush: boolean;
        readonly canPublish: boolean;
        readonly canDelete: boolean;
    },
): readonly string[] {
    const reasons: string[] = [];
    if (!capabilities.canPush) {
        reasons.push(branch.isRemote
            ? 'Push unavailable: remote branches cannot be pushed directly.'
            : 'Push unavailable: this branch has no upstream. Use Publish Branch.');
    }
    if (!capabilities.canPublish) {
        reasons.push(branch.isRemote
            ? 'Publish unavailable: remote branches are already published.'
            : 'Publish unavailable: this branch already has an upstream.');
    }
    if (!capabilities.canDelete) { reasons.push('Delete unavailable: the current branch cannot be deleted.'); }
    return reasons;
}
