import {
    renderGraphSvg,
    parseRefs,
    renderRefBadges,
    formatRelativeDate,
    escapeHtml,
} from './graphRenderer';
import { getCommitNavigationTarget, showCommitContextMenu, hideContextMenu } from './contextMenu';
import type { GraphRow } from '../graphView/graphLaneAssigner';
import { replaceWindowMessageHandler } from './windowMessages';
import { createBranchPaneController } from './graphBranches';
import { createGraphFilterController, createInitialGraphFilterState } from './graphFilters';
import { createCommitDetailsController } from './graphDetails';
import { GRAPH_CSS_CONTENT } from './graphStyles';
import type {
    FileChange,
    GraphFilterState,
    GraphData,
    PaneState,
} from './graphTypes';

// VS Code webview API
declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let graphData: GraphData | null = null;
let graphSentinelObserver: IntersectionObserver | null = null;
let isLoadingMoreGraph = false;
let selectedCommitHash: string | null = null;
let selectedCommitHashes = new Set<string>();
let selectionAnchorHash: string | null = null;
let lastGraphActivation: { hash: string; time: number; mode: string } | null = null;
let selectedBranches: string[] = []; // empty = all branches
let filterRequestTimer: number | undefined;
let filterState: GraphFilterState = createInitialGraphFilterState();

// Pane widths (persisted via vscode state)
const DEFAULT_BRANCH_WIDTH = 200;
const DEFAULT_DETAILS_WIDTH = 300;
const MIN_PANE_WIDTH = 100;

function loadPaneState(): PaneState {
    const state = vscode.getState() as PaneState | null;
    return {
        branchWidth: state?.branchWidth ?? DEFAULT_BRANCH_WIDTH,
        detailsWidth: state?.detailsWidth ?? DEFAULT_DETAILS_WIDTH,
        branchViewMode: state?.branchViewMode ?? 'tree',
        filesViewMode: state?.filesViewMode ?? 'tree',
        showGraph: state?.showGraph ?? true,
    };
}

function savePaneState(s: PaneState): void {
    vscode.setState(s);
}

let paneState = loadPaneState();
const branchPane = createBranchPaneController({
    getData: () => graphData,
    getSelectedBranches: () => selectedBranches,
    setSelectedBranches: (branches) => { selectedBranches = branches; },
    getViewMode: () => paneState.branchViewMode,
    setViewMode: (mode) => {
        paneState.branchViewMode = mode;
        savePaneState(paneState);
    },
    requestGraphData,
    renderFilterBar,
    postMessage: (msg) => vscode.postMessage(msg),
});

function renderBranchPane(): void {
    branchPane.render();
}

const filterBar = createGraphFilterController({
    getData: () => graphData,
    getState: () => filterState,
    setState: (state) => { filterState = state; },
    getSelectedBranches: () => selectedBranches,
    setSelectedBranches: (branches) => { selectedBranches = branches; },
    requestGraphData,
    scheduleGraphDataRequest,
    renderBranchPane,
    renderGraphTable,
});

function renderFilterBar(): void {
    filterBar.render();
}

const commitDetails = createCommitDetailsController({
    getData: () => graphData,
    getFilesViewMode: () => paneState.filesViewMode,
    setFilesViewMode: (mode) => {
        paneState.filesViewMode = mode;
        savePaneState(paneState);
    },
    postMessage: (msg) => vscode.postMessage(msg),
});

function renderCommitDetails(hash: string, fullMessage: string, files: FileChange[]): void {
    commitDetails.render(hash, fullMessage, files);
}

function requestGraphData(): void {
    isLoadingMoreGraph = false;
    const filters = filterState;
    const payload: {
        type: 'selectBranch';
        branches?: string[];
        path?: string;
        search?: string;
        authors?: string[];
        dateFrom?: string;
        dateTo?: string;
    } = {
        type: 'selectBranch',
        branches: selectedBranches.length > 0 ? [...selectedBranches] : undefined,
        path: filters.path || undefined,
    };
    const search = filters.search.trim();
    if (search) { payload.search = search; }
    if (filters.authors.length > 0) { payload.authors = [...filters.authors]; }
    if (filters.dateFrom) { payload.dateFrom = filters.dateFrom; }
    if (filters.dateTo) { payload.dateTo = filters.dateTo; }
    vscode.postMessage(payload);
}

function scheduleGraphDataRequest(): void {
    if (filterRequestTimer !== undefined) {
        clearTimeout(filterRequestTimer);
    }
    filterRequestTimer = window.setTimeout(() => {
        filterRequestTimer = undefined;
        requestGraphData();
    }, 250);
}

function requestMoreGraphData(): void {
    if (isLoadingMoreGraph || graphData?.hasMore !== true) {
        return;
    }

    isLoadingMoreGraph = true;
    renderGraphPaginationState();
    vscode.postMessage({ type: 'loadMoreGraph' });
}

function init(): void {
    const app = document.getElementById('app')!;
    app.innerHTML = getShellHtml();

    injectStyles();
    initResizeHandles();
    initGraphScroll();
    initGraphInteractions();

    // Wire up toolbar
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
        filterState = { ...filterState, search: searchInput.value.toLowerCase() };
        renderGraphTable();
        scheduleGraphDataRequest();
    });

    const refreshBtn = document.getElementById('refresh-btn')!;
    refreshBtn.addEventListener('click', () => {
        requestGraphData();
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

function initGraphScroll(): void {
    const graphPane = document.getElementById('graph-pane')!;
    graphPane.addEventListener('scroll', () => {
        if (graphPane.scrollTop + graphPane.clientHeight >= graphPane.scrollHeight - 320) {
            requestMoreGraphData();
        }
    });
}

function initGraphInteractions(): void {
    const graphPane = document.getElementById('graph-pane')!;

    graphPane.addEventListener('pointerup', (e) => {
        const me = e as PointerEvent;
        if (me.button !== 0) { return; }
        const row = findGraphRow(e.target);
        if (!row) { return; }
        activateGraphRow(row.dataset.hash!, getSelectionMode(me));
    });

    graphPane.addEventListener('click', (e) => {
        const me = e as MouseEvent;
        const row = findGraphRow(e.target);
        if (!row) { return; }
        activateGraphRow(row.dataset.hash!, getSelectionMode(me));
    });

    graphPane.addEventListener('contextmenu', (e) => {
        const row = findGraphRow(e.target);
        if (!row) { return; }

        e.preventDefault();
        const me = e as MouseEvent;
        const hash = row.dataset.hash!;
        selectGraphRowForContextMenu(hash);
        const commandHashes = getSelectedCommitHashesForCommand(hash);
        showCommitContextMenu(me.clientX, me.clientY, hash, graphData, commandHashes, (command, commitHash) => {
            const navigationTarget = getCommitNavigationTarget(graphData, commitHash, command);
            if (navigationTarget) {
                activateGraphRow(navigationTarget);
                return;
            }
            vscode.postMessage({
                type: 'executeCommand',
                command,
                commitHash,
                commitHashes: getSelectedCommitHashesForCommand(commitHash),
            });
        });
    });
}

function findGraphRow(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
        return null;
    }
    return target.closest('.graph-row') as HTMLElement | null;
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
    style.textContent = GRAPH_CSS_CONTENT;
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

// ── Graph Pane ──

function renderGraphTable(): void {
    if (!graphData) { return; }

    const pane = document.getElementById('graph-pane')!;
    const tagNames = new Set(graphData.tags.map((t) => t.name));
    const rows = getGraphRowsForRendering();
    const filters = filterState;
    const hasFilter = Boolean(
        filters.search || filters.authors.length > 0 || filters.dateFrom || filters.dateTo || filters.path,
    );
    const useBullet = !paneState.showGraph;
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

    // Build a map of commit hash → worktree paths (excluding the main worktree)
    const checkedOutInWorktree = new Map<string, string[]>();
    for (const wt of graphData.worktrees ?? []) {
        if (wt.isMain) { continue; }
        const existing = checkedOutInWorktree.get(wt.head) ?? [];
        existing.push(wt.path);
        checkedOutInWorktree.set(wt.head, existing);
    }

    for (const { row, matchesFilter } of rows) {
        const c = row.commit;
        const refs = parseRefs(c.refs, tagNames);
        const badges = renderRefBadges(refs);
        const isSelected = selectedCommitHashes.has(c.hash) ? ' selected' : '';
        const isPrimary = row.laneData.isPrimary ? ' primary-line' : '';
        const filterClass = hasFilter
            ? (matchesFilter ? ' filter-matched' : ' filter-dimmed')
            : '';
        const date = formatRelativeDate(new Date(c.authorDate));

        const wtPaths = checkedOutInWorktree.get(c.hash);
        const worktreeBadge = wtPaths
            ? `<span class="worktree-badge" title="Checked out in: ${escapeHtml(wtPaths.join(', '))}">WT</span>`
            : '';

        let graphCell: string;
        if (useBullet) {
            // Simple colored bullet when filtering or graph hidden
            graphCell = `<span class="filter-bullet" style="background: ${row.laneData.color};"></span>`;
        } else {
            graphCell = renderGraphSvg(row, graphData.maxLane);
        }

        html += `<tr class="graph-row${isSelected}${isPrimary}${filterClass}" data-hash="${c.hash}">
            <td class="graph-cell">${graphCell}</td>
            <td class="hash-col">${escapeHtml(c.shortHash)}</td>
            <td class="message-col">
                <button class="commit-row-button" type="button" data-hash="${c.hash}">
                    ${badges}<span class="commit-row-message">${escapeHtml(c.message)}</span>${worktreeBadge}
                </button>
            </td>
            <td class="author-col">${escapeHtml(c.authorName)}</td>
            <td class="date-col">${date}</td>
        </tr>`;
    }

    html += `</tbody></table>${getGraphPaginationHtml()}`;

    pane.innerHTML = html;

    observeGraphSentinel(pane);
}

function getGraphRowsForRendering(): Array<{ row: GraphRow; matchesFilter: boolean }> {
    if (!graphData) { return []; }

    const filters = filterState;
    const hasLocalFilter = Boolean(filters.search || filters.authors.length > 0 || filters.dateFrom || filters.dateTo);
    const hasAnyFilter = hasLocalFilter || Boolean(filters.path);
    return graphData.rows.map((row) => {
        if (!hasAnyFilter) {
            return { row, matchesFilter: true };
        }

        const serverMatch = filters.search ? row.commit.matchesFilter : undefined;
        const matchesFilter = typeof serverMatch === 'boolean'
            ? serverMatch
            : (!hasLocalFilter || graphRowMatchesLocalFilters(row));
        return { row, matchesFilter };
    });
}

function graphRowMatchesLocalFilters(row: GraphRow): boolean {
    const c = row.commit;
    const filters = filterState;
    if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesSearch = c.message.toLowerCase().includes(search)
            || c.hash.toLowerCase().includes(search)
            || c.shortHash.toLowerCase().includes(search)
            || c.authorName.toLowerCase().includes(search)
            || c.authorEmail.toLowerCase().includes(search);
        if (!matchesSearch) {
            return false;
        }
    }

    if (filters.authors.length > 0 && !filters.authors.includes(c.authorName)) {
        return false;
    }
    if (filters.dateFrom && new Date(c.authorDate).getTime() < new Date(filters.dateFrom).getTime()) {
        return false;
    }
    if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime() + 86400000; // include the full day
        if (new Date(c.authorDate).getTime() >= to) {
            return false;
        }
    }

    return true;
}

function getGraphPaginationHtml(): string {
    if (!graphData) { return ''; }
    if (isLoadingMoreGraph) {
        return `<div id="graph-loading-more" class="graph-loading-more" role="status" aria-live="polite">
            <span class="graph-loading-spinner" aria-hidden="true"></span>
            <span>Loading commits...</span>
        </div>`;
    }
    if (graphData.hasMore) {
        return '<div id="graph-scroll-sentinel" class="graph-scroll-sentinel" aria-label="Load more commits"></div>';
    }
    return '';
}

function renderGraphPaginationState(): void {
    const pane = document.getElementById('graph-pane');
    if (!pane) { return; }

    pane.querySelector('#graph-loading-more, #graph-scroll-sentinel')?.remove();
    const paginationHtml = getGraphPaginationHtml();
    if (paginationHtml) {
        pane.insertAdjacentHTML('beforeend', paginationHtml);
    }
    observeGraphSentinel(pane);
}

type SelectionMode = 'single' | 'range' | 'toggle';

function getSelectionMode(event?: MouseEvent | PointerEvent): SelectionMode {
    if (event?.shiftKey) { return 'range'; }
    if (event?.ctrlKey || event?.metaKey) { return 'toggle'; }
    return 'single';
}

function activateGraphRow(hash: string, mode: SelectionMode = 'single'): void {
    const now = Date.now();
    if (lastGraphActivation?.hash === hash && lastGraphActivation.mode === mode && now - lastGraphActivation.time < 80) {
        return;
    }
    lastGraphActivation = { hash, time: now, mode };

    updateSelectedCommitHashes(hash, mode);

    selectedCommitHash = hash;
    markSelectedGraphRows();
    vscode.postMessage({ type: 'getCommitDetails', hash });
}

function updateSelectedCommitHashes(hash: string, mode: SelectionMode): void {
    if (mode === 'range') {
        const range = getCommitRange(selectionAnchorHash, hash);
        selectedCommitHashes = new Set(range.length > 0 ? range : [hash]);
        return;
    }

    if (mode === 'toggle') {
        const nextSelection = new Set(selectedCommitHashes);
        if (nextSelection.has(hash)) {
            nextSelection.delete(hash);
        } else {
            nextSelection.add(hash);
        }
        selectedCommitHashes = nextSelection;
        selectionAnchorHash = hash;
        return;
    }

    selectedCommitHashes = new Set([hash]);
    selectionAnchorHash = hash;
}

function getCommitRange(anchorHash: string | null, hash: string): string[] {
    if (!graphData || !anchorHash) {
        selectionAnchorHash = hash;
        return [hash];
    }

    const hashes = graphData.rows.map((row) => row.commit.hash);
    const anchorIndex = hashes.indexOf(anchorHash);
    const targetIndex = hashes.indexOf(hash);
    if (anchorIndex === -1 || targetIndex === -1) {
        selectionAnchorHash = hash;
        return [hash];
    }

    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    return hashes.slice(start, end + 1);
}

function selectGraphRowForContextMenu(hash: string): void {
    if (!selectedCommitHashes.has(hash)) {
        selectedCommitHashes = new Set([hash]);
        selectionAnchorHash = hash;
    }
    selectedCommitHash = hash;
    markSelectedGraphRows();
}

function getSelectedCommitHashesForCommand(primaryHash: string): string[] {
    if (!graphData || !selectedCommitHashes.has(primaryHash)) {
        return [primaryHash];
    }

    const orderedHashes = graphData.rows
        .map((row) => row.commit.hash)
        .filter((hash) => selectedCommitHashes.has(hash));
    return orderedHashes.length > 0 ? orderedHashes : [primaryHash];
}

function markSelectedGraphRows(): void {
    const pane = document.getElementById('graph-pane');
    if (!pane) { return; }

    for (const row of Array.from(pane.querySelectorAll<HTMLElement>('.graph-row'))) {
        if (row.dataset.hash && selectedCommitHashes.has(row.dataset.hash)) {
            row.classList.add('selected');
        } else {
            row.classList.remove('selected');
        }
    }
}

function observeGraphSentinel(root: HTMLElement): void {
    if (graphSentinelObserver) {
        graphSentinelObserver.disconnect();
        graphSentinelObserver = null;
    }

    if (!graphData?.hasMore || typeof IntersectionObserver === 'undefined') {
        return;
    }

    const sentinel = document.getElementById('graph-scroll-sentinel');
    if (!sentinel) {
        return;
    }

    try {
        graphSentinelObserver = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                requestMoreGraphData();
            }
        }, {
            root,
            rootMargin: '320px 0px',
            threshold: 0,
        });
        graphSentinelObserver.observe(sentinel);
    } catch {
        graphSentinelObserver = null;
    }
}

// ── Message handling ──

replaceWindowMessageHandler('graph', (event) => {
    const msg = event.data;

    switch (msg.type) {
        case 'graphData':
            isLoadingMoreGraph = false;
            graphData = msg.data;
            renderFilterBar();
            renderBranchPane();
            renderGraphTable();
            // Clear details if selected commit no longer exists
            if (selectedCommitHash && graphData) {
                const exists = graphData.rows.some((r) => r.commit.hash === selectedCommitHash);
                if (!exists) {
                    selectedCommitHash = null;
                    selectedCommitHashes = new Set();
                    selectionAnchorHash = null;
                    const pane = document.getElementById('details-pane')!;
                    pane.className = 'details-pane empty';
                    pane.innerHTML = '<span>Click a commit to view details</span>';
                } else {
                    const availableHashes = new Set(graphData.rows.map((r) => r.commit.hash));
                    selectedCommitHashes = new Set([...selectedCommitHashes].filter((hash) => availableHashes.has(hash)));
                    if (selectionAnchorHash && !availableHashes.has(selectionAnchorHash)) {
                        selectionAnchorHash = selectedCommitHash;
                    }
                }
            }
            break;

        case 'commitDetails':
            renderCommitDetails(msg.hash, msg.fullMessage, msg.files);
            break;

        case 'error':
            isLoadingMoreGraph = false;
            console.error('Graph error:', msg.message);
            renderGraphPaginationState();
            break;
    }
});

// Close context menu when the surrounding UI scrolls, but keep it open while
// the user scrolls inside an overflowing context menu.
document.addEventListener('scroll', (event) => {
    if (event.target instanceof Element && event.target.closest('.context-menu')) {
        return;
    }
    hideContextMenu();
}, true);


// Boot
init();
