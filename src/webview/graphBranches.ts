import { showContextMenu, type MenuItem } from './contextMenu';
import { escapeHtml } from './graphRenderer';
import type { BranchInfo, BranchViewMode, GraphData } from './graphTypes';

interface BranchTreeNode {
    name: string;
    fullPath: string;
    children: Map<string, BranchTreeNode>;
    branch?: BranchInfo;
}

interface BranchPaneDeps {
    getData(): GraphData | null;
    getSelectedBranch(): string | null;
    setSelectedBranch(branch: string | null): void;
    getViewMode(): BranchViewMode;
    setViewMode(mode: BranchViewMode): void;
    requestGraphData(): void;
    renderFilterBar(): void;
    postMessage(msg: unknown): void;
}

const collapsedFolders = new Set<string>();
const wiredBranchPanes = new WeakSet<HTMLElement>();

const BRANCH_ICON_SVG = `<svg class="tree-branch-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 3v5a3 3 0 0 0 3 3h5M4 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;
const BRANCH_FOLDER_ICON_SVG = `<svg class="tree-folder-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.75 4.25A1.75 1.75 0 0 1 3.5 2.5h2.35c.46 0 .9.18 1.24.5l.84.75h4.57a1.75 1.75 0 0 1 1.75 1.75v6A1.75 1.75 0 0 1 12.5 13.25h-9a1.75 1.75 0 0 1-1.75-1.75V4.25zm1.5.25v7c0 .14.11.25.25.25h9a.25.25 0 0 0 .25-.25v-6a.25.25 0 0 0-.25-.25H7.35L6.08 4.1a.35.35 0 0 0-.23-.1H3.5a.25.25 0 0 0-.25.25z" fill="currentColor"/>
</svg>`;
const CHEVRON_RIGHT_SVG = `<svg class="tree-chevron-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const CHEVRON_DOWN_SVG = `<svg class="tree-chevron-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const INCOMING_CHANGES_SVG = `<svg class="branch-incoming-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 18L6 9M6 18L15 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export function createBranchPaneController(deps: BranchPaneDeps): { render(): void } {
    function render(): void {
        const graphData = deps.getData();
        if (!graphData) { return; }

        const pane = document.getElementById('branch-pane')!;
        const local = graphData.branches.filter((b) => !b.isRemote);
        const remote = graphData.branches.filter((b) => b.isRemote);
        const mode = deps.getViewMode();
        const selectedBranch = deps.getSelectedBranch();
        const listActiveClass = mode === 'list' ? ' active' : '';
        const treeActiveClass = mode === 'tree' ? ' active' : '';

        let html = `<div class="branch-pane-toolbar">
            <div class="branch-item ${selectedBranch === null ? 'active' : ''}" data-branch="__all__">
                <span class="branch-name">All Branches</span>
            </div>
            <div class="view-switcher">
                <button class="view-switch-btn${listActiveClass}" data-mode="list" title="List view">&#9776;</button>
                <button class="view-switch-btn${treeActiveClass}" data-mode="tree" title="Tree view">&#128466;</button>
            </div>
        </div>`;

        html += mode === 'list'
            ? renderBranchList(local, remote, selectedBranch)
            : renderBranchTreeView(local, remote, selectedBranch);

        pane.innerHTML = html;
        wireBranchPaneHandlers(pane, deps, render);
    }

    return { render };
}

function buildBranchTree(branches: BranchInfo[]): BranchTreeNode {
    const root: BranchTreeNode = { name: '', fullPath: '', children: new Map() };

    for (const branch of branches) {
        const parts = branch.name.split('/');
        let current = root;
        let path = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            path = path ? `${path}/${part}` : part;

            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    fullPath: path,
                    children: new Map(),
                });
            }

            current = current.children.get(part)!;
            if (i === parts.length - 1) {
                current.branch = branch;
            }
        }
    }

    return root;
}

function renderCurrentBranchIndicator(branch: BranchInfo): string {
    if (!branch.isCurrent) { return ''; }
    return '<span class="current-branch-indicator" title="Current branch" aria-label="Current branch"></span>';
}

function renderIncomingChangesIndicator(branch: BranchInfo): string {
    const behind = branch.behind ?? 0;
    if (branch.isRemote || behind <= 0) { return ''; }

    const upstream = branch.upstream ?? 'upstream';
    const label = `${behind} commit${behind === 1 ? '' : 's'} behind ${upstream}`;
    const displayCount = behind >= 100 ? '99+' : String(behind);
    return `<span class="branch-remote-pending-indicator" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${INCOMING_CHANGES_SVG}<span class="branch-behind-count" aria-hidden="true">${displayCount}</span></span>`;
}

function renderTreeNodes(node: BranchTreeNode, depth: number, selectedBranch: string | null): string {
    let html = '';
    const entries = [...node.children.values()].sort((a, b) => {
        const aIsFolder = a.children.size > 0 && !a.branch;
        const bIsFolder = b.children.size > 0 && !b.branch;
        if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
        return a.name.localeCompare(b.name);
    });

    for (const child of entries) {
        const hasChildren = child.children.size > 0;
        const indent = depth * 16;

        if (hasChildren) {
            const collapsed = collapsedFolders.has(child.fullPath);
            const chevron = collapsed ? CHEVRON_RIGHT_SVG : CHEVRON_DOWN_SVG;
            html += `<div class="branch-tree-folder" data-folder="${escapeHtml(child.fullPath)}" data-collapsed="${collapsed}" style="--tree-indent: ${indent}px; padding-left: ${indent}px;">
                <span class="tree-arrow">${chevron}</span>
                ${BRANCH_FOLDER_ICON_SVG}
                <span class="tree-folder-name">${escapeHtml(child.name)}</span>
            </div>`;

            if (!collapsed) {
                html += renderTreeNodes(child, depth + 1, selectedBranch);
            }
        } else if (child.branch) {
            html += renderTreeLeaf(child.branch, child.name, indent, selectedBranch);
        }

        if (hasChildren && child.branch) {
            html += renderTreeLeaf(child.branch, child.name, (depth + 1) * 16, selectedBranch);
        }
    }

    return html;
}

function renderTreeLeaf(
    branch: BranchInfo,
    label: string,
    indent: number,
    selectedBranch: string | null,
): string {
    const isCurrent = branch.isCurrent ? ' current' : '';
    const isActive = selectedBranch === branch.name ? ' active' : '';
    const remoteAttr = branch.isRemote ? ' data-remote="true"' : '';
    return `<div class="branch-item tree-leaf${isCurrent}${isActive}" data-branch="${escapeHtml(branch.name)}"${remoteAttr} style="--tree-indent: ${indent}px; padding-left: ${indent + 4}px;">
        ${BRANCH_ICON_SVG}
        ${renderCurrentBranchIndicator(branch)}
        <span class="branch-name">${escapeHtml(label)}</span>
        ${renderIncomingChangesIndicator(branch)}
    </div>`;
}

function renderBranchList(
    local: BranchInfo[],
    remote: BranchInfo[],
    selectedBranch: string | null,
): string {
    let html = '<div class="branch-section-header">Local</div>';
    for (const b of local) {
        const isCurrent = b.isCurrent ? ' current' : '';
        const isActive = selectedBranch === b.name ? ' active' : '';
        html += `<div class="branch-item${isCurrent}${isActive}" data-branch="${escapeHtml(b.name)}">
            ${renderCurrentBranchIndicator(b)}
            <span class="branch-name">${escapeHtml(b.name)}</span>
            ${renderIncomingChangesIndicator(b)}
        </div>`;
    }

    if (remote.length > 0) {
        html += '<div class="branch-section-header">Remote</div>';
        for (const b of remote) {
            const isActive = selectedBranch === b.name ? ' active' : '';
            html += `<div class="branch-item${isActive}" data-branch="${escapeHtml(b.name)}" data-remote="true">
                <span class="branch-name">${escapeHtml(b.name)}</span>
            </div>`;
        }
    }

    return html;
}

function renderBranchTreeView(
    local: BranchInfo[],
    remote: BranchInfo[],
    selectedBranch: string | null,
): string {
    let html = '';

    if (local.length > 0) {
        html += '<div class="branch-section-header">Local</div>';
        html += renderTreeNodes(buildBranchTree(local), 1, selectedBranch);
    }

    if (remote.length > 0) {
        html += '<div class="branch-section-header">Remote</div>';
        html += renderTreeNodes(buildBranchTree(remote), 1, selectedBranch);
    }

    return html;
}

function buildLocalBranchMenu(branch: string, currentBranch: string): MenuItem[] {
    const isCurrent = branch === currentBranch;
    return [
        { label: 'Checkout', command: 'checkout', disabled: isCurrent },
        { label: `New Branch from ${branch}...`, command: 'newBranchFrom' },
        { label: 'Rename...', command: 'rename' },
        { label: '', command: '', separator: true },
        { label: 'Delete', command: 'delete', disabled: isCurrent },
        { label: 'Push', command: 'push' },
        { label: 'Update (Fetch)', command: 'update' },
        { label: '', command: '', separator: true },
        { label: `Rebase ${currentBranch} onto ${branch}`, command: 'rebaseOnto', disabled: isCurrent },
        { label: `Merge ${branch} into ${currentBranch}`, command: 'mergeInto', disabled: isCurrent },
    ];
}

function buildRemoteBranchMenu(branch: string, currentBranch: string): MenuItem[] {
    return [
        { label: 'Checkout', command: 'checkout' },
        { label: `New Branch from ${branch}...`, command: 'newBranchFrom' },
        { label: 'Checkout and Rebase onto', command: 'checkoutRebaseOnto' },
        { label: '', command: '', separator: true },
        { label: `Delete ${branch}`, command: 'delete' },
        { label: `Merge ${branch} into ${currentBranch}`, command: 'mergeInto' },
    ];
}

function wireBranchPaneHandlers(
    pane: HTMLElement,
    deps: BranchPaneDeps,
    render: () => void,
): void {
    if (wiredBranchPanes.has(pane)) {
        return;
    }
    wiredBranchPanes.add(pane);

    pane.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) { return; }

        const viewButton = closestInside<HTMLElement>(target, '.view-switch-btn', pane);
        if (viewButton) {
            event.stopPropagation();
            deps.setViewMode(viewButton.dataset.mode as BranchViewMode);
            render();
            return;
        }

        const folder = closestInside<HTMLElement>(target, '.branch-tree-folder', pane);
        if (folder) {
            const folderPath = folder.dataset.folder!;
            if (collapsedFolders.has(folderPath)) {
                collapsedFolders.delete(folderPath);
            } else {
                collapsedFolders.add(folderPath);
            }
            render();
            return;
        }

        const branchItem = closestInside<HTMLElement>(target, '.branch-item', pane);
        if (!branchItem) { return; }

        const branch = branchItem.dataset.branch!;
        deps.setSelectedBranch(branch === '__all__' ? null : branch);
        deps.requestGraphData();
        deps.renderFilterBar();
        render();
    });

    pane.addEventListener('contextmenu', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) { return; }

        const branchItem = closestInside<HTMLElement>(target, '.branch-item', pane);
        if (!branchItem) { return; }

        const branch = branchItem.dataset.branch!;
        if (branch === '__all__') { return; }

        event.preventDefault();
        const graphData = deps.getData();
        const isRemote = branchItem.dataset.remote === 'true';
        const currentBranch = graphData?.currentBranch ?? '';
        const items = isRemote
            ? buildRemoteBranchMenu(branch, currentBranch)
            : buildLocalBranchMenu(branch, currentBranch);
        showContextMenu(event.clientX, event.clientY, items, (command) => {
            deps.postMessage({ type: 'executeBranchCommand', command, branch, isRemote });
        });
    });
}

function closestInside<TElement extends Element>(
    target: Element,
    selector: string,
    root: Element,
): TElement | null {
    const match = target.closest(selector);
    return match && root.contains(match) ? match as TElement : null;
}
