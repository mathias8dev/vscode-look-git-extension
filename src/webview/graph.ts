import {
    renderGraphSvg,
    parseRefs,
    renderRefBadges,
    formatRelativeDate,
    escapeHtml,
} from './graphRenderer';
import { showContextMenu, showCommitContextMenu, hideContextMenu } from './contextMenu';
import type { MenuItem } from './contextMenu';
import type { GraphRow } from '../graphView/graphLaneAssigner';

// VS Code webview API
declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

interface BranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
    hash: string;
}

interface TagInfo {
    name: string;
    hash: string;
}

interface FileChange {
    status: string;
    filePath: string;
}

interface GraphData {
    branches: BranchInfo[];
    tags: TagInfo[];
    rows: GraphRow[];
    maxLane: number;
    currentBranch: string;
    currentUser: string;
}

let graphData: GraphData | null = null;
let selectedCommitHash: string | null = null;
let selectedBranch: string | null = null; // null = all branches
let searchFilter = '';

// Filters
let filterAuthors: string[] = [];
let filterDateFrom: string | null = null; // ISO date string (YYYY-MM-DD)
let filterDateTo: string | null = null;
let filterPath: string | null = null;

// Pane widths (persisted via vscode state)
const DEFAULT_BRANCH_WIDTH = 200;
const DEFAULT_DETAILS_WIDTH = 300;
const MIN_PANE_WIDTH = 100;

type BranchViewMode = 'list' | 'tree';
type FilesViewMode = 'list' | 'tree';

interface PaneState {
    branchWidth: number;
    detailsWidth: number;
    branchViewMode: BranchViewMode;
    filesViewMode: FilesViewMode;
    showGraph: boolean;
}

function loadPaneState(): PaneState {
    const state = vscode.getState() as PaneState | null;
    return {
        branchWidth: state?.branchWidth ?? DEFAULT_BRANCH_WIDTH,
        detailsWidth: state?.detailsWidth ?? DEFAULT_DETAILS_WIDTH,
        branchViewMode: state?.branchViewMode ?? 'list',
        filesViewMode: state?.filesViewMode ?? 'list',
        showGraph: state?.showGraph ?? true,
    };
}

function savePaneState(s: PaneState): void {
    vscode.setState(s);
}

let paneState = loadPaneState();

function init(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = getShellHtml();

    injectStyles();
    initResizeHandles();

    // Wire up toolbar
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
        searchFilter = searchInput.value.toLowerCase();
        renderGraphTable();
    });

    const refreshBtn = document.getElementById('refresh-btn')!;
    refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    const toggleGraphBtn = document.getElementById('toggle-graph-btn')!;
    toggleGraphBtn.addEventListener('click', () => {
        paneState.showGraph = !paneState.showGraph;
        savePaneState(paneState);
        toggleGraphBtn.classList.toggle('active', paneState.showGraph);
        toggleGraphBtn.title = paneState.showGraph ? 'Hide graph lines' : 'Show graph lines';
        renderGraphTable();
    });

    renderFilterBar();

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' });
}

function getShellHtml(): string {
    return `
        <div class="graph-container" id="graph-container"
             style="grid-template-columns: ${paneState.branchWidth}px 4px 1fr 4px ${paneState.detailsWidth}px;">
            <div class="toolbar">
                <div class="filter-bar" id="filter-bar"></div>
                <input type="text" id="search-input" placeholder="Search commits..." />
                <button id="refresh-btn">Refresh</button>
                <button id="toggle-graph-btn" class="toggle-graph-btn${paneState.showGraph ? ' active' : ''}" title="${paneState.showGraph ? 'Hide graph lines' : 'Show graph lines'}">Graph</button>
            </div>
            <div class="branch-pane" id="branch-pane"></div>
            <div class="resize-handle" id="resize-left"></div>
            <div class="graph-pane" id="graph-pane"></div>
            <div class="resize-handle" id="resize-right"></div>
            <div class="details-pane empty" id="details-pane">
                <span>Click a commit to view details</span>
            </div>
        </div>
    `;
}

function injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = CSS_CONTENT;
    document.head.appendChild(style);
}

// ── Resize Handles ──

function initResizeHandles(): void {
    const container = document.getElementById('graph-container')!;
    const leftHandle = document.getElementById('resize-left')!;
    const rightHandle = document.getElementById('resize-right')!;

    setupResize(leftHandle, container, 'left');
    setupResize(rightHandle, container, 'right');
}

function setupResize(
    handle: HTMLElement,
    container: HTMLElement,
    side: 'left' | 'right',
): void {
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        let newWidth: number;

        if (side === 'left') {
            newWidth = Math.max(MIN_PANE_WIDTH, startWidth + delta);
            paneState.branchWidth = newWidth;
        } else {
            // For the right handle, dragging right shrinks the details pane
            newWidth = Math.max(MIN_PANE_WIDTH, startWidth - delta);
            paneState.detailsWidth = newWidth;
        }

        applyPaneWidths(container);
    };

    const onMouseUp = () => {
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        savePaneState(paneState);
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = side === 'left' ? paneState.branchWidth : paneState.detailsWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

function applyPaneWidths(container: HTMLElement): void {
    container.style.gridTemplateColumns =
        `${paneState.branchWidth}px 4px 1fr 4px ${paneState.detailsWidth}px`;
}

// ── Filter Bar ──

let activeDropdown: HTMLElement | null = null;

function closeDropdown(): void {
    if (activeDropdown) {
        activeDropdown.remove();
        activeDropdown = null;
    }
}

function showDropdown(anchorEl: HTMLElement, items: { label: string; value: string }[], onSelect: (value: string) => void): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    for (const item of items) {
        const el = document.createElement('div');
        el.className = 'filter-dropdown-item';
        el.textContent = item.label;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            closeDropdown();
            onSelect(item.value);
        });
        dropdown.appendChild(el);
    }

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    // Adjust if off-screen
    const dropRect = dropdown.getBoundingClientRect();
    if (dropRect.right > window.innerWidth) {
        dropdown.style.left = `${window.innerWidth - dropRect.width - 4}px`;
    }
    if (dropRect.bottom > window.innerHeight) {
        dropdown.style.maxHeight = `${window.innerHeight - rect.bottom - 8}px`;
    }

    setTimeout(() => {
        const close = () => { closeDropdown(); document.removeEventListener('click', close); };
        document.addEventListener('click', close);
    }, 0);
}

function showUserDropdown(anchorEl: HTMLElement, authors: string[]): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown user-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    const currentUser = graphData?.currentUser || '';
    const selected = new Set(filterAuthors);

    let html = '';

    // "Me" shortcut at the top
    if (currentUser) {
        const meChecked = selected.has(currentUser) ? ' checked' : '';
        html += `<label class="filter-dropdown-check me-option">
            <input type="checkbox" value="${escapeHtml(currentUser)}"${meChecked} />
            <span>Me</span>
            <span class="me-name">(${escapeHtml(currentUser)})</span>
        </label>`;
        html += '<div class="user-dropdown-separator"></div>';
    }

    // All authors with checkboxes
    for (const author of authors) {
        const checked = selected.has(author) ? ' checked' : '';
        html += `<label class="filter-dropdown-check">
            <input type="checkbox" value="${escapeHtml(author)}"${checked} />
            <span>${escapeHtml(author)}</span>
        </label>`;
    }

    dropdown.innerHTML = html;
    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    // Adjust if off-screen
    const dropRect = dropdown.getBoundingClientRect();
    if (dropRect.right > window.innerWidth) {
        dropdown.style.left = `${window.innerWidth - dropRect.width - 4}px`;
    }
    if (dropRect.bottom > window.innerHeight) {
        dropdown.style.maxHeight = `${window.innerHeight - rect.bottom - 8}px`;
    }

    // Listen to checkbox changes
    dropdown.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const checkbox = cb as HTMLInputElement;
            const value = checkbox.value;
            if (checkbox.checked) {
                if (!filterAuthors.includes(value)) {
                    filterAuthors.push(value);
                }
            } else {
                filterAuthors = filterAuthors.filter((a) => a !== value);
            }
            // Keep "Me" checkbox in sync with the matching author checkbox
            dropdown.querySelectorAll(`input[type="checkbox"]`).forEach((other) => {
                const otherCb = other as HTMLInputElement;
                if (otherCb !== checkbox && otherCb.value === value) {
                    otherCb.checked = checkbox.checked;
                }
            });
            renderFilterBar();
            renderGraphTable();
        });
    });

    // Prevent closing when clicking inside
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    setTimeout(() => {
        const close = () => { closeDropdown(); document.removeEventListener('click', close); };
        document.addEventListener('click', close);
    }, 0);
}

function showDateDropdown(anchorEl: HTMLElement): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown date-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    dropdown.innerHTML = `
        <div class="date-field"><label>From</label><input type="date" id="filter-date-from" value="${filterDateFrom || ''}" /></div>
        <div class="date-field"><label>To</label><input type="date" id="filter-date-to" value="${filterDateTo || ''}" /></div>
        <div class="date-actions">
            <button id="date-apply-btn">Apply</button>
            <button id="date-clear-btn">Clear</button>
        </div>
    `;

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    dropdown.querySelector('#date-apply-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        const from = (dropdown.querySelector('#filter-date-from') as HTMLInputElement).value;
        const to = (dropdown.querySelector('#filter-date-to') as HTMLInputElement).value;
        filterDateFrom = from || null;
        filterDateTo = to || null;
        closeDropdown();
        renderFilterBar();
        renderGraphTable();
    });

    dropdown.querySelector('#date-clear-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        filterDateFrom = null;
        filterDateTo = null;
        closeDropdown();
        renderFilterBar();
        renderGraphTable();
    });

    // Prevent closing when clicking inside the dropdown
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    setTimeout(() => {
        const close = () => { closeDropdown(); document.removeEventListener('click', close); };
        document.addEventListener('click', close);
    }, 0);
}

function showPathInput(anchorEl: HTMLElement): void {
    closeDropdown();

    const rect = anchorEl.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.className = 'filter-dropdown path-dropdown';
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;

    dropdown.innerHTML = `
        <div class="path-field">
            <input type="text" id="filter-path-input" placeholder="e.g. src/commands" value="${filterPath || ''}" />
        </div>
        <div class="date-actions">
            <button id="path-apply-btn">Apply</button>
            <button id="path-clear-btn">Clear</button>
        </div>
    `;

    document.body.appendChild(dropdown);
    activeDropdown = dropdown;

    const input = dropdown.querySelector('#filter-path-input') as HTMLInputElement;
    input.focus();

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            filterPath = input.value || null;
            closeDropdown();
            renderFilterBar();
            renderGraphTable();
        }
    });

    dropdown.querySelector('#path-apply-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPath = input.value || null;
        closeDropdown();
        renderFilterBar();
        renderGraphTable();
    });

    dropdown.querySelector('#path-clear-btn')!.addEventListener('click', (e) => {
        e.stopPropagation();
        filterPath = null;
        closeDropdown();
        renderFilterBar();
        renderGraphTable();
    });

    dropdown.addEventListener('click', (e) => e.stopPropagation());

    setTimeout(() => {
        const close = () => { closeDropdown(); document.removeEventListener('click', close); };
        document.addEventListener('click', close);
    }, 0);
}

function getUniqueAuthors(): string[] {
    if (!graphData) { return []; }
    const authors = new Set<string>();
    for (const row of graphData.rows) {
        authors.add(row.commit.authorName);
    }
    return [...authors].sort((a, b) => a.localeCompare(b));
}

function renderFilterBar(): void {
    const bar = document.getElementById('filter-bar')!;
    let html = '';

    // Branch chip
    if (selectedBranch) {
        html += `<span class="filter-chip active" data-filter="branch">
            Branch: <strong>${escapeHtml(truncate(selectedBranch, 20))}</strong>
            <span class="filter-chip-clear" data-clear="branch">&times;</span>
        </span>`;
    } else {
        html += `<span class="filter-chip" data-filter="branch">Branch</span>`;
    }

    // User chip
    if (filterAuthors.length > 0) {
        const label = filterAuthors.length === 1
            ? truncate(filterAuthors[0], 15)
            : `${filterAuthors.length} users`;
        html += `<span class="filter-chip active" data-filter="user">
            User: <strong>${escapeHtml(label)}</strong>
            <span class="filter-chip-clear" data-clear="user">&times;</span>
        </span>`;
    } else {
        html += `<span class="filter-chip" data-filter="user">User &#9662;</span>`;
    }

    // Date chip
    if (filterDateFrom || filterDateTo) {
        const label = formatDateRange(filterDateFrom, filterDateTo);
        html += `<span class="filter-chip active" data-filter="date">
            Date: <strong>${escapeHtml(label)}</strong>
            <span class="filter-chip-clear" data-clear="date">&times;</span>
        </span>`;
    } else {
        html += `<span class="filter-chip" data-filter="date">Date &#9662;</span>`;
    }

    // Paths chip
    if (filterPath) {
        html += `<span class="filter-chip active" data-filter="paths">
            Paths: <strong>${escapeHtml(truncate(filterPath, 18))}</strong>
            <span class="filter-chip-clear" data-clear="paths">&times;</span>
        </span>`;
    } else {
        html += `<span class="filter-chip" data-filter="paths">Paths &#9662;</span>`;
    }

    bar.innerHTML = html;
    wireFilterBarHandlers(bar);
}

function wireFilterBarHandlers(bar: HTMLElement): void {
    // Chip clicks — open dropdowns
    bar.querySelectorAll('.filter-chip').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const filter = (el as HTMLElement).dataset.filter!;
            switch (filter) {
                case 'branch':
                    // Branch filter is controlled by the left pane; clicking the chip
                    // just focuses the branch pane (no dropdown needed)
                    break;
                case 'user': {
                    const authors = getUniqueAuthors();
                    showUserDropdown(el as HTMLElement, authors);
                    break;
                }
                case 'date':
                    showDateDropdown(el as HTMLElement);
                    break;
                case 'paths':
                    showPathInput(el as HTMLElement);
                    break;
            }
        });
    });

    // Clear buttons
    bar.querySelectorAll('.filter-chip-clear').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const clear = (el as HTMLElement).dataset.clear!;
            switch (clear) {
                case 'branch':
                    selectedBranch = null;
                    vscode.postMessage({ type: 'selectBranch', branches: undefined });
                    renderBranchPane();
                    break;
                case 'user':
                    filterAuthors = [];
                    break;
                case 'date':
                    filterDateFrom = null;
                    filterDateTo = null;
                    break;
                case 'paths':
                    filterPath = null;
                    break;
            }
            renderFilterBar();
            renderGraphTable();
        });
    });
}

function truncate(str: string, maxLen: number): string {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function formatDateRange(from: string | null, to: string | null): string {
    if (from && to) { return `${from} \u2013 ${to}`; }
    if (from) { return `from ${from}`; }
    if (to) { return `until ${to}`; }
    return '';
}

// ── Branch Pane ──

interface BranchTreeNode {
    name: string;         // segment name (e.g. "feature" or "login")
    fullPath: string;     // full branch name for leaves
    children: Map<string, BranchTreeNode>;
    branch?: BranchInfo;  // set only on leaf nodes
}

// Track which tree folders are collapsed (persisted across renders, not across sessions)
const collapsedFolders = new Set<string>();

function buildBranchTree(branches: BranchInfo[]): BranchTreeNode {
    const root: BranchTreeNode = { name: '', fullPath: '', children: new Map() };

    for (const b of branches) {
        const segments = b.name.split('/');
        let node = root;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const path = segments.slice(0, i + 1).join('/');

            if (!node.children.has(seg)) {
                node.children.set(seg, {
                    name: seg,
                    fullPath: path,
                    children: new Map(),
                });
            }
            node = node.children.get(seg)!;
        }

        // Mark leaf
        node.branch = b;
    }

    return root;
}

const BRANCH_ICON_SVG = `<svg class="tree-branch-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm9-9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM3.5 5v4.5a2 2 0 0 0 2 2H9v-2l3.5 2.5L9 14.5v-2H5.5a4 4 0 0 1-4-4V5h2z" fill="currentColor"/>
</svg>`;

function renderTreeNodes(node: BranchTreeNode, depth: number): string {
    let html = '';

    // Sort: folders first, then leaves, both alphabetically
    const entries = [...node.children.values()].sort((a, b) => {
        const aIsFolder = a.children.size > 0 && !a.branch;
        const bIsFolder = b.children.size > 0 && !b.branch;
        if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
        return a.name.localeCompare(b.name);
    });

    for (const child of entries) {
        const isFolder = child.children.size > 0 && !child.branch;
        const indent = depth * 16;

        if (isFolder) {
            const collapsed = collapsedFolders.has(child.fullPath);
            const arrow = collapsed ? '&#9654;' : '&#9660;';
            html += `<div class="branch-tree-folder" data-folder="${escapeHtml(child.fullPath)}" style="padding-left: ${indent}px;">
                <span class="tree-arrow">${arrow}</span>
                <span class="tree-folder-icon">&#128193;</span>
                <span class="tree-folder-name">${escapeHtml(child.name)}</span>
            </div>`;

            if (!collapsed) {
                html += renderTreeNodes(child, depth + 1);
            }
        } else if (child.branch) {
            const b = child.branch;
            const isCurrent = b.isCurrent ? ' current' : '';
            const isActive = selectedBranch === b.name ? ' active' : '';
            const remoteAttr = b.isRemote ? ' data-remote="true"' : '';
            html += `<div class="branch-item tree-leaf${isCurrent}${isActive}" data-branch="${escapeHtml(b.name)}"${remoteAttr} style="padding-left: ${indent + 4}px;">
                ${BRANCH_ICON_SVG}
                <span class="branch-name">${escapeHtml(child.name)}</span>
            </div>`;
        }

        // If the node is both a folder and a leaf (branch named same as a prefix),
        // render the leaf too
        if (isFolder && child.branch) {
            const b = child.branch;
            const isCurrent = b.isCurrent ? ' current' : '';
            const isActive = selectedBranch === b.name ? ' active' : '';
            const remoteAttr = b.isRemote ? ' data-remote="true"' : '';
            html += `<div class="branch-item tree-leaf${isCurrent}${isActive}" data-branch="${escapeHtml(b.name)}"${remoteAttr} style="padding-left: ${(depth + 1) * 16 + 4}px;">
                ${BRANCH_ICON_SVG}
                <span class="branch-name">${escapeHtml(child.name)}</span>
            </div>`;
        }
    }

    return html;
}

function renderBranchPane(): void {
    if (!graphData) { return; }

    const pane = document.getElementById('branch-pane')!;
    const local = graphData.branches.filter((b) => !b.isRemote);
    const remote = graphData.branches.filter((b) => b.isRemote);
    const mode = paneState.branchViewMode;

    // View switcher + "All branches"
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

    if (mode === 'list') {
        html += renderBranchList(local, remote);
    } else {
        html += renderBranchTreeView(local, remote);
    }

    pane.innerHTML = html;
    wireBranchPaneHandlers(pane);
}

function renderBranchList(local: BranchInfo[], remote: BranchInfo[]): string {
    let html = '';

    html += '<div class="branch-section-header">Local</div>';
    for (const b of local) {
        const isCurrent = b.isCurrent ? ' current' : '';
        const isActive = selectedBranch === b.name ? ' active' : '';
        html += `<div class="branch-item${isCurrent}${isActive}" data-branch="${escapeHtml(b.name)}">
            <span class="branch-name">${escapeHtml(b.name)}</span>
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

function renderBranchTreeView(local: BranchInfo[], remote: BranchInfo[]): string {
    let html = '';

    if (local.length > 0) {
        html += '<div class="branch-section-header">Local</div>';
        const localTree = buildBranchTree(local);
        html += renderTreeNodes(localTree, 1);
    }

    if (remote.length > 0) {
        html += '<div class="branch-section-header">Remote</div>';
        const remoteTree = buildBranchTree(remote);
        html += renderTreeNodes(remoteTree, 1);
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
        { label: `Rebase ${branch} onto ${currentBranch}`, command: 'rebaseOnto', disabled: isCurrent },
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

function wireBranchPaneHandlers(pane: HTMLElement): void {
    // View switcher buttons
    pane.querySelectorAll('.view-switch-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = (el as HTMLElement).dataset.mode as BranchViewMode;
            paneState.branchViewMode = mode;
            savePaneState(paneState);
            renderBranchPane();
        });
    });

    // Branch item clicks
    pane.querySelectorAll('.branch-item').forEach((el) => {
        el.addEventListener('click', () => {
            const branch = (el as HTMLElement).dataset.branch!;
            if (branch === '__all__') {
                selectedBranch = null;
                vscode.postMessage({ type: 'selectBranch', branches: undefined });
            } else {
                selectedBranch = branch;
                vscode.postMessage({ type: 'selectBranch', branches: [branch] });
            }
            renderFilterBar();
            renderBranchPane();
        });
    });

    // Branch item right-click context menus
    pane.querySelectorAll('.branch-item').forEach((el) => {
        el.addEventListener('contextmenu', (e) => {
            const branch = (el as HTMLElement).dataset.branch!;
            if (branch === '__all__') { return; }
            e.preventDefault();
            const me = e as MouseEvent;
            const isRemote = (el as HTMLElement).dataset.remote === 'true';
            const currentBranch = graphData?.currentBranch ?? '';
            const items = isRemote
                ? buildRemoteBranchMenu(branch, currentBranch)
                : buildLocalBranchMenu(branch, currentBranch);
            showContextMenu(me.clientX, me.clientY, items, (command) => {
                vscode.postMessage({ type: 'executeBranchCommand', command, branch, isRemote });
            });
        });
    });

    // Tree folder toggle clicks
    pane.querySelectorAll('.branch-tree-folder').forEach((el) => {
        el.addEventListener('click', () => {
            const folder = (el as HTMLElement).dataset.folder!;
            if (collapsedFolders.has(folder)) {
                collapsedFolders.delete(folder);
            } else {
                collapsedFolders.add(folder);
            }
            renderBranchPane();
        });
    });
}

// ── Graph Pane ──

function renderGraphTable(): void {
    if (!graphData) { return; }

    const pane = document.getElementById('graph-pane')!;
    const tagNames = new Set(graphData.tags.map((t) => t.name));

    let rows = graphData.rows;

    // Apply filters
    if (searchFilter) {
        rows = rows.filter((r) => {
            const c = r.commit;
            return c.message.toLowerCase().includes(searchFilter)
                || c.shortHash.toLowerCase().includes(searchFilter)
                || c.authorName.toLowerCase().includes(searchFilter);
        });
    }
    if (filterAuthors.length > 0) {
        const authors = new Set(filterAuthors);
        rows = rows.filter((r) => authors.has(r.commit.authorName));
    }
    if (filterDateFrom) {
        const from = new Date(filterDateFrom).getTime();
        rows = rows.filter((r) => new Date(r.commit.authorDate).getTime() >= from);
    }
    if (filterDateTo) {
        const to = new Date(filterDateTo).getTime() + 86400000; // include the full day
        rows = rows.filter((r) => new Date(r.commit.authorDate).getTime() < to);
    }
    if (filterPath) {
        const pathLower = filterPath.toLowerCase();
        // Path filtering requires commit file data which we don't have client-side for all commits.
        // Filter by checking if the path string appears in the commit message as a fallback,
        // or filter by refs that contain the path. For a proper implementation we'd need
        // server-side filtering. Here we filter messages/hashes that mention the path.
        rows = rows.filter((r) => {
            const c = r.commit;
            return c.message.toLowerCase().includes(pathLower)
                || c.refs.some((ref) => ref.toLowerCase().includes(pathLower));
        });
    }

    const hasFilter = !!(searchFilter || filterAuthors.length > 0 || filterDateFrom || filterDateTo || filterPath);
    const useBullet = hasFilter || !paneState.showGraph;
    const graphColWidth = useBullet ? 24 : (graphData.maxLane + 2) * 16 + 16;

    let html = `<table class="graph-table">
        <thead><tr>
            <th style="width: ${graphColWidth}px;"></th>
            <th class="hash-col">Hash</th>
            <th class="message-col">Message</th>
            <th class="author-col">Author</th>
            <th class="date-col">Date</th>
        </tr></thead>
        <tbody>`;

    for (const row of rows) {
        const c = row.commit;
        const refs = parseRefs(c.refs, tagNames);
        const badges = renderRefBadges(refs);
        const isSelected = c.hash === selectedCommitHash ? ' selected' : '';
        const date = formatRelativeDate(new Date(c.authorDate));

        let graphCell: string;
        if (useBullet) {
            // Simple colored bullet when filtering or graph hidden
            graphCell = `<span class="filter-bullet" style="background: ${row.laneData.color};"></span>`;
        } else {
            graphCell = renderGraphSvg(row, graphData.maxLane);
        }

        html += `<tr class="graph-row${isSelected}" data-hash="${c.hash}">
            <td class="graph-cell">${graphCell}</td>
            <td class="hash-col">${escapeHtml(c.shortHash)}</td>
            <td class="message-col">${badges}${escapeHtml(c.message)}</td>
            <td class="author-col">${escapeHtml(c.authorName)}</td>
            <td class="date-col">${date}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    pane.innerHTML = html;

    // Wire click and context menu handlers
    pane.querySelectorAll('.graph-row').forEach((el) => {
        const hash = (el as HTMLElement).dataset.hash!;

        el.addEventListener('click', () => {
            selectedCommitHash = hash;
            renderGraphTable(); // re-highlight
            vscode.postMessage({ type: 'getCommitDetails', hash });
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const me = e as MouseEvent;
            selectedCommitHash = hash;
            renderGraphTable();
            showCommitContextMenu(me.clientX, me.clientY, hash, (command, commitHash) => {
                vscode.postMessage({ type: 'executeCommand', command, commitHash });
            });
        });
    });
}

// ── Details Pane ──

// File icon SVGs based on file extension — covers common types
const FILE_ICON_MAP: Record<string, { color: string; letter: string }> = {
    ts: { color: '#3178c6', letter: 'TS' },
    tsx: { color: '#3178c6', letter: 'TX' },
    js: { color: '#f1e05a', letter: 'JS' },
    jsx: { color: '#f1e05a', letter: 'JX' },
    json: { color: '#a8b34b', letter: '{}' },
    css: { color: '#563d7c', letter: '#' },
    scss: { color: '#c6538c', letter: '#' },
    less: { color: '#1d365d', letter: '#' },
    html: { color: '#e34c26', letter: '<>' },
    md: { color: '#519aba', letter: 'M' },
    py: { color: '#3572a5', letter: 'Py' },
    rb: { color: '#cc342d', letter: 'Rb' },
    go: { color: '#00add8', letter: 'Go' },
    rs: { color: '#dea584', letter: 'Rs' },
    java: { color: '#b07219', letter: 'J' },
    kt: { color: '#a97bff', letter: 'Kt' },
    swift: { color: '#f05138', letter: 'Sw' },
    c: { color: '#555555', letter: 'C' },
    cpp: { color: '#f34b7d', letter: 'C+' },
    h: { color: '#555555', letter: 'H' },
    cs: { color: '#178600', letter: 'C#' },
    php: { color: '#4f5d95', letter: 'P' },
    sh: { color: '#89e051', letter: '$' },
    bash: { color: '#89e051', letter: '$' },
    yml: { color: '#cb171e', letter: 'Y' },
    yaml: { color: '#cb171e', letter: 'Y' },
    toml: { color: '#9c4221', letter: 'T' },
    xml: { color: '#e34c26', letter: '<>' },
    svg: { color: '#ffb13b', letter: 'Sv' },
    png: { color: '#a074c4', letter: 'Im' },
    jpg: { color: '#a074c4', letter: 'Im' },
    jpeg: { color: '#a074c4', letter: 'Im' },
    gif: { color: '#a074c4', letter: 'Im' },
    sql: { color: '#e38c00', letter: 'Sq' },
    graphql: { color: '#e10098', letter: 'Gq' },
    vue: { color: '#41b883', letter: 'V' },
    svelte: { color: '#ff3e00', letter: 'Sv' },
    lock: { color: '#6a737d', letter: 'Lk' },
    env: { color: '#6a737d', letter: 'Ev' },
    gitignore: { color: '#6a737d', letter: 'Gi' },
    dockerfile: { color: '#384d54', letter: 'Dk' },
    makefile: { color: '#427819', letter: 'Mk' },
};

const DEFAULT_FILE_ICON = { color: '#6a737d', letter: 'F' };

function getFileIconInfo(filePath: string): { color: string; letter: string } {
    const name = filePath.split('/').pop() || '';
    const nameLower = name.toLowerCase();

    // Check special filenames first
    if (nameLower === 'dockerfile') { return FILE_ICON_MAP['dockerfile']; }
    if (nameLower === 'makefile') { return FILE_ICON_MAP['makefile']; }
    if (nameLower.startsWith('.env')) { return FILE_ICON_MAP['env']; }
    if (nameLower === '.gitignore') { return FILE_ICON_MAP['gitignore']; }

    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
    return FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON;
}

function renderFileIconSvg(filePath: string): string {
    const info = getFileIconInfo(filePath);
    return `<svg class="file-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="1" width="12" height="14" rx="1.5" fill="${info.color}" opacity="0.15" stroke="${info.color}" stroke-width="0.5"/>
        <text x="8" y="10.5" text-anchor="middle" font-size="6" font-weight="600" fill="${info.color}">${info.letter}</text>
    </svg>`;
}

const FOLDER_ICON_SVG = `<svg class="folder-icon" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v9A1.5 1.5 0 0 0 1.5 14h13a1.5 1.5 0 0 0 1.5-1.5V5.5A1.5 1.5 0 0 0 14.5 4H8L6.5 2H1.5z"
          fill="var(--vscode-icon-foreground, #c09553)" opacity="0.85"/>
</svg>`;

// File tree structure for the details pane
interface FileTreeNode {
    name: string;
    fullPath: string;
    children: Map<string, FileTreeNode>;
    file?: FileChange;  // set on leaf nodes
}

const collapsedDetailsFolders = new Set<string>();

function buildFileTree(files: FileChange[]): FileTreeNode {
    const root: FileTreeNode = { name: '', fullPath: '', children: new Map() };

    for (const f of files) {
        const segments = f.filePath.split('/');
        let node = root;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const path = segments.slice(0, i + 1).join('/');

            if (!node.children.has(seg)) {
                node.children.set(seg, {
                    name: seg,
                    fullPath: path,
                    children: new Map(),
                });
            }
            node = node.children.get(seg)!;
        }

        node.file = f;
    }

    return root;
}

// Collapse single-child folder chains into one node (e.g. "src/utils" instead of "src" > "utils")
function collapseFileTree(node: FileTreeNode): FileTreeNode {
    for (const [key, child] of node.children) {
        const collapsed = collapseFileTree(child);
        node.children.set(key, collapsed);
    }

    // If this non-root folder has exactly one child that is also a folder, merge
    if (!node.file && node.children.size === 1 && node.name !== '') {
        const [, onlyChild] = [...node.children.entries()][0];
        if (!onlyChild.file && onlyChild.children.size > 0) {
            return {
                name: `${node.name}/${onlyChild.name}`,
                fullPath: onlyChild.fullPath,
                children: onlyChild.children,
            };
        }
    }

    return node;
}

function renderFileTreeNodes(node: FileTreeNode, hash: string, depth: number): string {
    let html = '';

    const entries = [...node.children.values()].sort((a, b) => {
        const aIsFolder = !a.file && a.children.size > 0;
        const bIsFolder = !b.file && b.children.size > 0;
        if (aIsFolder !== bIsFolder) { return aIsFolder ? -1 : 1; }
        return a.name.localeCompare(b.name);
    });

    for (const child of entries) {
        const isFolder = !child.file && child.children.size > 0;
        const indent = depth * 16;

        if (isFolder) {
            const collapsed = collapsedDetailsFolders.has(child.fullPath);
            const arrow = collapsed ? '&#9654;' : '&#9660;';
            html += `<div class="file-tree-folder" data-folder="${escapeHtml(child.fullPath)}" style="padding-left: ${indent}px;">
                <span class="tree-arrow">${arrow}</span>
                ${FOLDER_ICON_SVG}
                <span class="file-tree-folder-name">${escapeHtml(child.name)}</span>
            </div>`;

            if (!collapsed) {
                html += renderFileTreeNodes(child, hash, depth + 1);
            }
        } else if (child.file) {
            const f = child.file;
            const statusClass = getStatusClass(f.status);
            html += `<div class="file-item file-tree-item" data-file="${escapeHtml(f.filePath)}" data-status="${f.status}" data-hash="${hash}" style="padding-left: ${indent}px;">
                ${renderFileIconSvg(f.filePath)}
                <span class="file-path">${escapeHtml(child.name)}</span>
                <span class="file-status-badge ${statusClass}">${f.status}</span>
            </div>`;
        }

        // Node is both folder and file
        if (isFolder && child.file) {
            const f = child.file;
            const statusClass = getStatusClass(f.status);
            html += `<div class="file-item file-tree-item" data-file="${escapeHtml(f.filePath)}" data-status="${f.status}" data-hash="${hash}" style="padding-left: ${(depth + 1) * 16}px;">
                ${renderFileIconSvg(f.filePath)}
                <span class="file-path">${escapeHtml(child.name)}</span>
                <span class="file-status-badge ${statusClass}">${f.status}</span>
            </div>`;
        }
    }

    return html;
}

function renderCommitDetails(
    hash: string,
    fullMessage: string,
    files: FileChange[],
): void {
    if (!graphData) { return; }

    const pane = document.getElementById('details-pane')!;
    pane.classList.remove('empty');

    const row = graphData.rows.find((r) => r.commit.hash === hash);
    if (!row) { return; }

    const c = row.commit;
    const date = new Date(c.authorDate);

    let html = `
        <div class="details-header">
            <h3>${escapeHtml(c.message)}</h3>
            <div class="details-field">
                <span class="label">Hash</span>
                <span class="value mono">${escapeHtml(c.hash)}</span>
            </div>
            <div class="details-field">
                <span class="label">Author</span>
                <span class="value">${escapeHtml(c.authorName)} &lt;${escapeHtml(c.authorEmail)}&gt;</span>
            </div>
            <div class="details-field">
                <span class="label">Date</span>
                <span class="value">${date.toLocaleString()}</span>
            </div>`;

    if (c.parentHashes.length > 0) {
        html += `
            <div class="details-field">
                <span class="label">Parents</span>
                <span class="value mono">${c.parentHashes.map((h) => h.substring(0, 7)).join(', ')}</span>
            </div>`;
    }

    html += '</div>';

    if (fullMessage && fullMessage !== c.message) {
        html += `<div class="details-message">${escapeHtml(fullMessage)}</div>`;
    }

    const filesMode = paneState.filesViewMode;
    const listActive = filesMode === 'list' ? ' active' : '';
    const treeActive = filesMode === 'tree' ? ' active' : '';

    html += `<div class="details-files-toolbar">
        <span class="details-files-header">Changed Files (${files.length})</span>
        <div class="view-switcher">
            <button class="view-switch-btn${listActive}" data-files-mode="list" title="List view">&#9776;</button>
            <button class="view-switch-btn${treeActive}" data-files-mode="tree" title="Tree view">&#128466;</button>
        </div>
    </div>`;

    if (filesMode === 'list') {
        for (const f of files) {
            const statusClass = getStatusClass(f.status);
            html += `
                <div class="file-item" data-file="${escapeHtml(f.filePath)}" data-status="${f.status}" data-hash="${hash}">
                    ${renderFileIconSvg(f.filePath)}
                    <span class="file-status ${statusClass}">${f.status}</span>
                    <span class="file-path">${escapeHtml(f.filePath)}</span>
                </div>`;
        }
    } else {
        const rawTree = buildFileTree(files);
        const tree = collapseFileTree(rawTree);
        html += renderFileTreeNodes(tree, hash, 0);
    }

    pane.innerHTML = html;
    wireDetailsPaneHandlers(pane, hash, fullMessage, files);
}

function wireDetailsPaneHandlers(
    pane: HTMLElement,
    hash: string,
    fullMessage: string,
    files: FileChange[],
): void {
    // View switcher
    pane.querySelectorAll('[data-files-mode]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = (el as HTMLElement).dataset.filesMode as FilesViewMode;
            paneState.filesViewMode = mode;
            savePaneState(paneState);
            renderCommitDetails(hash, fullMessage, files);
        });
    });

    // Folder toggle
    pane.querySelectorAll('.file-tree-folder').forEach((el) => {
        el.addEventListener('click', () => {
            const folder = (el as HTMLElement).dataset.folder!;
            if (collapsedDetailsFolders.has(folder)) {
                collapsedDetailsFolders.delete(folder);
            } else {
                collapsedDetailsFolders.add(folder);
            }
            renderCommitDetails(hash, fullMessage, files);
        });
    });

    // File click handlers
    pane.querySelectorAll('.file-item').forEach((el) => {
        el.addEventListener('click', () => {
            const d = (el as HTMLElement).dataset;
            vscode.postMessage({
                type: 'openDiff',
                filePath: d.file,
                commitHash: d.hash,
                status: d.status,
            });
        });
    });
}

function getStatusClass(status: string): string {
    switch (status.charAt(0)) {
        case 'A': return 'added';
        case 'M': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        default: return 'modified';
    }
}

// ── Message handling ──

window.addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {
        case 'graphData':
            graphData = msg.data;
            renderFilterBar();
            renderBranchPane();
            renderGraphTable();
            // Clear details if selected commit no longer exists
            if (selectedCommitHash && graphData) {
                const exists = graphData.rows.some((r) => r.commit.hash === selectedCommitHash);
                if (!exists) {
                    selectedCommitHash = null;
                    const pane = document.getElementById('details-pane')!;
                    pane.className = 'details-pane empty';
                    pane.innerHTML = '<span>Click a commit to view details</span>';
                }
            }
            break;

        case 'commitDetails':
            renderCommitDetails(msg.hash, msg.fullMessage, msg.files);
            break;

        case 'error':
            console.error('Graph error:', msg.message);
            break;
    }
});

// Close context menu on scroll
document.addEventListener('scroll', hideContextMenu, true);

// ── Inline CSS (injected at runtime) ──
// We inline the CSS here since the webview CSP blocks external stylesheets
// unless we add more complex URI handling. This keeps it simple.

const CSS_CONTENT = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }

.graph-container { display: grid; grid-template-columns: 200px 4px 1fr 4px 300px; grid-template-rows: auto 1fr; height: 100vh; }

.toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--vscode-titleBar-activeBackground); border-bottom: 1px solid var(--vscode-panel-border); }
.toolbar input[type="text"] { flex: 1; max-width: 300px; padding: 3px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: var(--vscode-font-size); outline: none; }
.toolbar input[type="text"]:focus { border-color: var(--vscode-focusBorder); }
.toolbar button { padding: 3px 10px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 3px; cursor: pointer; font-size: var(--vscode-font-size); }
.toolbar button:hover { background: var(--vscode-button-hoverBackground); }
.toggle-graph-btn { opacity: 0.5; background: transparent !important; border-color: var(--vscode-input-border) !important; color: var(--vscode-foreground) !important; }
.toggle-graph-btn:hover { opacity: 0.8; background: var(--vscode-list-hoverBackground) !important; }
.toggle-graph-btn.active { opacity: 1; background: var(--vscode-badge-background) !important; color: var(--vscode-badge-foreground) !important; border-color: var(--vscode-badge-background) !important; }

.filter-bar { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.filter-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--vscode-input-border); border-radius: 12px; font-size: 11px; cursor: pointer; white-space: nowrap; color: var(--vscode-descriptionForeground); background: transparent; }
.filter-chip:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
.filter-chip.active { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-color: var(--vscode-badge-background); }
.filter-chip-clear { margin-left: 2px; font-size: 13px; line-height: 1; cursor: pointer; opacity: 0.7; }
.filter-chip-clear:hover { opacity: 1; }

.filter-dropdown { position: fixed; z-index: 100; min-width: 160px; max-height: 240px; overflow-y: auto; background: var(--vscode-menu-background); color: var(--vscode-menu-foreground); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.filter-dropdown-item { padding: 4px 12px; cursor: pointer; white-space: nowrap; font-size: 12px; }
.filter-dropdown-item:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }

.user-dropdown { min-width: 200px; padding: 4px 0; }
.filter-dropdown-check { display: flex; align-items: center; gap: 6px; padding: 4px 12px; cursor: pointer; white-space: nowrap; font-size: 12px; }
.filter-dropdown-check:hover { background: var(--vscode-list-hoverBackground); }
.filter-dropdown-check input[type="checkbox"] { margin: 0; cursor: pointer; accent-color: var(--vscode-focusBorder); }
.filter-dropdown-check .me-name { color: var(--vscode-descriptionForeground); font-size: 11px; }
.me-option { font-weight: 500; }
.user-dropdown-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }

.date-dropdown { padding: 8px 12px; min-width: 200px; }
.date-field { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.date-field label { font-size: 11px; min-width: 32px; color: var(--vscode-descriptionForeground); }
.date-field input[type="date"] { flex: 1; padding: 2px 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 12px; }
.date-actions { display: flex; gap: 6px; margin-top: 4px; }
.date-actions button { flex: 1; padding: 3px 8px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; font-size: 11px; }
.date-actions button:first-child { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.date-actions button:first-child:hover { background: var(--vscode-button-hoverBackground); }
.date-actions button:last-child { background: transparent; color: var(--vscode-descriptionForeground); border-color: var(--vscode-input-border); }
.date-actions button:last-child:hover { background: var(--vscode-list-hoverBackground); }

.path-dropdown { padding: 8px 12px; min-width: 220px; }
.path-field input[type="text"] { width: 100%; padding: 3px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-size: 12px; margin-bottom: 6px; outline: none; }
.path-field input[type="text"]:focus { border-color: var(--vscode-focusBorder); }

.branch-pane { overflow-y: auto; border-right: 1px solid var(--vscode-panel-border); padding: 8px 0; }
.branch-section-header { padding: 4px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0.5px; }
.branch-item { display: flex; align-items: center; gap: 6px; padding: 3px 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.branch-item:hover { background: var(--vscode-list-hoverBackground); }
.branch-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.branch-item.current::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-gitDecoration-addedResourceForeground, #85e89d); flex-shrink: 0; }
.branch-item .branch-name { overflow: hidden; text-overflow: ellipsis; }

.branch-pane-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 4px 0; border-bottom: 1px solid var(--vscode-panel-border); margin-bottom: 4px; }
.branch-pane-toolbar .branch-item { flex: 1; }

.view-switcher { display: flex; gap: 2px; flex-shrink: 0; }
.view-switch-btn { width: 24px; height: 22px; border: 1px solid transparent; background: transparent; color: var(--vscode-descriptionForeground); border-radius: 3px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0; }
.view-switch-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); }
.view-switch-btn.active { color: var(--vscode-foreground); background: var(--vscode-toolbar-activeBackground, rgba(99, 102, 103, 0.31)); border-color: var(--vscode-focusBorder); }

.branch-tree-folder { display: flex; align-items: center; gap: 4px; padding: 3px 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
.branch-tree-folder:hover { background: var(--vscode-list-hoverBackground); }
.tree-arrow { font-size: 9px; width: 12px; text-align: center; flex-shrink: 0; color: var(--vscode-descriptionForeground); }
.tree-folder-icon { font-size: 13px; flex-shrink: 0; }
.tree-folder-name { overflow: hidden; text-overflow: ellipsis; }
.tree-branch-icon { flex-shrink: 0; color: var(--vscode-descriptionForeground); vertical-align: middle; }
.branch-item.tree-leaf { gap: 4px; }

.graph-pane { overflow: auto; position: relative; }
.graph-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.graph-table th { position: sticky; top: 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); z-index: 1; }
.graph-row { cursor: pointer; }
.graph-row:hover { background: var(--vscode-list-hoverBackground); }
.graph-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.graph-row td { padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; line-height: 28px; }
.graph-cell { padding: 0 !important; overflow: visible !important; }
.graph-cell svg { display: block; }
.commit-dot { stroke-width: 2; }
.filter-bullet { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 auto; vertical-align: middle; }
.graph-cell { text-align: center; }

.ref-badge { display: inline-block; padding: 0 6px; margin-right: 4px; border-radius: 3px; font-size: 11px; line-height: 18px; font-weight: 500; vertical-align: middle; }
.ref-badge.branch-local { background: var(--vscode-gitDecoration-addedResourceForeground, #28a745); color: #fff; }
.ref-badge.branch-remote { background: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); color: #fff; }
.ref-badge.tag { background: var(--vscode-gitDecoration-ignoredResourceForeground, #6a737d); color: #fff; }
.ref-badge.head { background: var(--vscode-gitDecoration-untrackedResourceForeground, #f97583); color: #fff; }

.hash-col { font-family: var(--vscode-editor-font-family, monospace); color: var(--vscode-textLink-foreground); width: 70px; }
.author-col { width: 120px; color: var(--vscode-descriptionForeground); }
.date-col { width: 130px; color: var(--vscode-descriptionForeground); }

.details-pane { overflow-y: auto; border-left: 1px solid var(--vscode-panel-border); padding: 12px; }
.details-pane.empty { display: flex; align-items: center; justify-content: center; color: var(--vscode-descriptionForeground); }
.details-header { margin-bottom: 12px; }
.details-header h3 { font-size: 14px; margin-bottom: 8px; }
.details-field { display: flex; gap: 8px; margin-bottom: 4px; font-size: 12px; }
.details-field .label { color: var(--vscode-descriptionForeground); min-width: 60px; flex-shrink: 0; }
.details-field .value { word-break: break-all; }
.details-field .value.mono { font-family: var(--vscode-editor-font-family, monospace); }
.details-message { margin: 12px 0; padding: 8px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); white-space: pre-wrap; font-size: 12px; }
.details-files-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.details-files-header { font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); }
.file-item { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; border-radius: 3px; font-size: 12px; }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-status { width: 16px; text-align: center; font-weight: 700; font-size: 11px; flex-shrink: 0; }
.file-status.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }
.file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-icon { flex-shrink: 0; }
.folder-icon { flex-shrink: 0; }
.file-tree-folder { display: flex; align-items: center; gap: 4px; padding: 2px 4px; cursor: pointer; border-radius: 3px; font-size: 12px; white-space: nowrap; }
.file-tree-folder:hover { background: var(--vscode-list-hoverBackground); }
.file-tree-folder-name { overflow: hidden; text-overflow: ellipsis; }
.file-tree-item { gap: 4px; }
.file-status-badge { margin-left: auto; font-size: 10px; font-weight: 700; flex-shrink: 0; padding: 0 4px; border-radius: 3px; line-height: 16px; }
.file-status-badge.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status-badge.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status-badge.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status-badge.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }

.context-menu { position: fixed; z-index: 100; min-width: 180px; background: var(--vscode-menu-background); color: var(--vscode-menu-foreground); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.context-menu-item { padding: 4px 24px; cursor: pointer; white-space: nowrap; }
.context-menu-item:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }
.context-menu-item.disabled { opacity: 0.4; cursor: default; }
.context-menu-item.disabled:hover { background: transparent; color: inherit; }
.context-menu-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }

.resize-handle { cursor: col-resize; background: transparent; position: relative; z-index: 2; }
.resize-handle:hover, .resize-handle.active { background: var(--vscode-focusBorder); }
`;

// Boot
init();
