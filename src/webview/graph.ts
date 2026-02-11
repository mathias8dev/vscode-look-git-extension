import {
    renderGraphSvg,
    parseRefs,
    renderRefBadges,
    formatRelativeDate,
    escapeHtml,
} from './graphRenderer';
import { showContextMenu, hideContextMenu } from './contextMenu';
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
}

let graphData: GraphData | null = null;
let selectedCommitHash: string | null = null;
let selectedBranch: string | null = null; // null = all branches
let searchFilter = '';

// Pane widths (persisted via vscode state)
const DEFAULT_BRANCH_WIDTH = 200;
const DEFAULT_DETAILS_WIDTH = 300;
const MIN_PANE_WIDTH = 100;

interface PaneState {
    branchWidth: number;
    detailsWidth: number;
}

function loadPaneState(): PaneState {
    const state = vscode.getState() as PaneState | null;
    return {
        branchWidth: state?.branchWidth ?? DEFAULT_BRANCH_WIDTH,
        detailsWidth: state?.detailsWidth ?? DEFAULT_DETAILS_WIDTH,
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

    // Tell extension we're ready
    vscode.postMessage({ type: 'ready' });
}

function getShellHtml(): string {
    return `
        <div class="graph-container" id="graph-container"
             style="grid-template-columns: ${paneState.branchWidth}px 4px 1fr 4px ${paneState.detailsWidth}px;">
            <div class="toolbar">
                <input type="text" id="search-input" placeholder="Search commits..." />
                <button id="refresh-btn">Refresh</button>
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

// ── Branch Pane ──

function renderBranchPane(): void {
    if (!graphData) { return; }

    const pane = document.getElementById('branch-pane')!;
    const local = graphData.branches.filter((b) => !b.isRemote);
    const remote = graphData.branches.filter((b) => b.isRemote);

    let html = '';

    // "All branches" item
    html += `<div class="branch-item ${selectedBranch === null ? 'active' : ''}" data-branch="__all__">
        <span class="branch-name">All Branches</span>
    </div>`;

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
            html += `<div class="branch-item${isActive}" data-branch="${escapeHtml(b.name)}">
                <span class="branch-name">${escapeHtml(b.name)}</span>
            </div>`;
        }
    }

    pane.innerHTML = html;

    // Add click handlers
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
            renderBranchPane(); // re-render to update active state
        });
    });
}

// ── Graph Pane ──

function renderGraphTable(): void {
    if (!graphData) { return; }

    const pane = document.getElementById('graph-pane')!;
    const tagNames = new Set(graphData.tags.map((t) => t.name));

    let rows = graphData.rows;
    if (searchFilter) {
        rows = rows.filter((r) => {
            const c = r.commit;
            return c.message.toLowerCase().includes(searchFilter)
                || c.shortHash.toLowerCase().includes(searchFilter)
                || c.authorName.toLowerCase().includes(searchFilter);
        });
    }

    let html = `<table class="graph-table">
        <thead><tr>
            <th style="width: ${(graphData.maxLane + 2) * 16 + 16}px;"></th>
            <th class="hash-col">Hash</th>
            <th class="message-col">Message</th>
            <th class="author-col">Author</th>
            <th class="date-col">Date</th>
        </tr></thead>
        <tbody>`;

    for (const row of rows) {
        const c = row.commit;
        const svgHtml = renderGraphSvg(row, graphData.maxLane);
        const refs = parseRefs(c.refs, tagNames);
        const badges = renderRefBadges(refs);
        const isSelected = c.hash === selectedCommitHash ? ' selected' : '';
        const date = formatRelativeDate(new Date(c.authorDate));

        html += `<tr class="graph-row${isSelected}" data-hash="${c.hash}">
            <td class="graph-cell">${svgHtml}</td>
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
            showContextMenu(me.clientX, me.clientY, hash, (command, commitHash) => {
                if (command === 'lookGit.copyCommitHash') {
                    // Handle copy locally — not a VS Code command in webview
                    vscode.postMessage({ type: 'executeCommand', command, commitHash });
                } else {
                    vscode.postMessage({ type: 'executeCommand', command, commitHash });
                }
            });
        });
    });
}

// ── Details Pane ──

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

    html += `<div class="details-files-header">Changed Files (${files.length})</div>`;
    for (const f of files) {
        const statusClass = getStatusClass(f.status);
        html += `
            <div class="file-item" data-file="${escapeHtml(f.filePath)}" data-status="${f.status}" data-hash="${hash}">
                <span class="file-status ${statusClass}">${f.status}</span>
                <span class="file-path">${escapeHtml(f.filePath)}</span>
            </div>`;
    }

    pane.innerHTML = html;

    // Wire file click handlers
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

.branch-pane { overflow-y: auto; border-right: 1px solid var(--vscode-panel-border); padding: 8px 0; }
.branch-section-header { padding: 4px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--vscode-descriptionForeground); letter-spacing: 0.5px; }
.branch-item { display: flex; align-items: center; gap: 6px; padding: 3px 12px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.branch-item:hover { background: var(--vscode-list-hoverBackground); }
.branch-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.branch-item.current::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-gitDecoration-addedResourceForeground, #85e89d); flex-shrink: 0; }
.branch-item .branch-name { overflow: hidden; text-overflow: ellipsis; }

.graph-pane { overflow: auto; position: relative; }
.graph-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.graph-table th { position: sticky; top: 0; background: var(--vscode-editor-background); border-bottom: 1px solid var(--vscode-panel-border); padding: 4px 8px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; color: var(--vscode-descriptionForeground); z-index: 1; }
.graph-row { cursor: pointer; }
.graph-row:hover { background: var(--vscode-list-hoverBackground); }
.graph-row.selected { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.graph-row td { padding: 2px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: middle; line-height: 24px; }
.graph-cell { padding: 0 !important; overflow: visible !important; }
.graph-cell svg { display: block; }
.commit-dot { stroke-width: 2; }

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
.details-files-header { font-size: 12px; font-weight: 600; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
.file-item { display: flex; align-items: center; gap: 6px; padding: 2px 4px; cursor: pointer; border-radius: 3px; font-size: 12px; }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-status { width: 16px; text-align: center; font-weight: 700; font-size: 11px; flex-shrink: 0; }
.file-status.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }
.file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.context-menu { position: fixed; z-index: 100; min-width: 180px; background: var(--vscode-menu-background); color: var(--vscode-menu-foreground); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); border-radius: 4px; padding: 4px 0; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); }
.context-menu-item { padding: 4px 24px; cursor: pointer; white-space: nowrap; }
.context-menu-item:hover { background: var(--vscode-menu-selectionBackground); color: var(--vscode-menu-selectionForeground); }
.context-menu-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }

.resize-handle { cursor: col-resize; background: transparent; position: relative; z-index: 2; }
.resize-handle:hover, .resize-handle.active { background: var(--vscode-focusBorder); }
`;

// Boot
init();
