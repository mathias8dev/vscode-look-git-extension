declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

interface StatusEntry {
    indexStatus: string;
    workTreeStatus: string;
    filePath: string;
    origPath?: string;
}

interface StatusData {
    staged: StatusEntry[];
    unstaged: StatusEntry[];
    conflicts: StatusEntry[];
    conflictState: 'none' | 'merge' | 'rebase';
}

interface ViewState {
    commitMessage: string;
    commitMode: string;
    stagedCollapsed: boolean;
    unstagedCollapsed: boolean;
    conflictsCollapsed: boolean;
}

let statusData: StatusData | null = null;
let commitMessage = '';
let commitMode = 'commit';
let stagedCollapsed = false;
let unstagedCollapsed = false;
let conflictsCollapsed = false;

function loadState(): void {
    const state = vscode.getState() as ViewState | null;
    if (state) {
        commitMessage = state.commitMessage || '';
        commitMode = state.commitMode || 'commit';
        stagedCollapsed = state.stagedCollapsed ?? false;
        unstagedCollapsed = state.unstagedCollapsed ?? false;
        conflictsCollapsed = state.conflictsCollapsed ?? false;
    }
}

function saveState(): void {
    vscode.setState({ commitMessage, commitMode, stagedCollapsed, unstagedCollapsed, conflictsCollapsed });
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── SVG Icons (codicon-style) ──

const ICON_PLUS = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
const ICON_MINUS = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 8h10" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;
const ICON_DISCARD = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4.5 3L3 4.5M3 4.5L4.5 6M3 4.5h6a3.5 3.5 0 0 1 0 7H5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_OPEN_FILE = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 2h7l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>`;
const ICON_CHEVRON_DOWN = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHEVRON_RIGHT = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_DROPDOWN = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_MERGE_EDITOR = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3v10M13 3v10M3 8h10" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
const ICON_ACCEPT_OURS = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8h9M8 5l3 3-3 3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="13" y1="3" x2="13" y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
const ICON_ACCEPT_THEIRS = `<svg width="16" height="16" viewBox="0 0 16 16"><path d="M14 8H5M8 5L5 8l3 3" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="3" x2="3" y2="13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;

const COMMIT_MODES: { id: string; label: string }[] = [
    { id: 'commit', label: 'Commit' },
    { id: 'amend', label: 'Commit (Amend)' },
    { id: 'commitPush', label: 'Commit & Push' },
    { id: 'commitSync', label: 'Commit & Sync' },
];

function getCommitLabel(): string {
    return COMMIT_MODES.find((m) => m.id === commitMode)?.label ?? 'Commit';
}

// ── Init ──

function init(): void {
    const app = document.getElementById('app')!;
    loadState();
    app.innerHTML = getShellHtml();
    injectStyles();

    const textarea = document.getElementById('commit-message') as HTMLTextAreaElement;
    if (commitMessage) { textarea.value = commitMessage; }

    wireStaticHandlers();
    vscode.postMessage({ type: 'ready' });
}

function getShellHtml(): string {
    return `
        <div class="changes-container">
            <div class="commit-section">
                <textarea id="commit-message" placeholder="Message (Ctrl+Enter to commit)" rows="3"></textarea>
                <div class="commit-actions">
                    <div class="split-btn">
                        <button id="commit-btn" class="primary-btn split-main" disabled>
                            ${ICON_CHECK} <span id="commit-label">${getCommitLabel()}</span>
                        </button>
                        <button id="commit-dropdown-btn" class="primary-btn split-dropdown" title="Commit mode">
                            ${ICON_DROPDOWN}
                        </button>
                    </div>
                </div>
                <div class="dropdown-menu" id="commit-dropdown" style="display:none;"></div>
            </div>
            <div class="files-section" id="files-section">
                <div class="empty-state">No changes detected</div>
            </div>
        </div>
    `;
}

function wireStaticHandlers(): void {
    const textarea = document.getElementById('commit-message') as HTMLTextAreaElement;
    const commitBtn = document.getElementById('commit-btn') as HTMLButtonElement;
    const dropdownBtn = document.getElementById('commit-dropdown-btn')!;
    const dropdownMenu = document.getElementById('commit-dropdown')!;

    textarea.addEventListener('input', () => {
        commitMessage = textarea.value;
        saveState();
        updateCommitButton();
    });

    commitBtn.addEventListener('click', () => {
        if (!commitMessage.trim()) { return; }
        vscode.postMessage({ type: 'commit', message: commitMessage, mode: commitMode });
        commitMessage = '';
        textarea.value = '';
        saveState();
        updateCommitButton();
    });

    textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            commitBtn.click();
        }
    });

    dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const visible = dropdownMenu.style.display !== 'none';
        if (visible) {
            dropdownMenu.style.display = 'none';
        } else {
            renderDropdown();
            dropdownMenu.style.display = 'block';
        }
    });

    document.addEventListener('click', () => {
        dropdownMenu.style.display = 'none';
    });
}

function renderDropdown(): void {
    const menu = document.getElementById('commit-dropdown')!;
    let html = '';
    for (const mode of COMMIT_MODES) {
        const active = mode.id === commitMode ? ' active' : '';
        html += `<div class="dropdown-item${active}" data-mode="${mode.id}">${mode.label}</div>`;
    }
    menu.innerHTML = html;

    menu.querySelectorAll('.dropdown-item').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            commitMode = (el as HTMLElement).dataset.mode!;
            document.getElementById('commit-label')!.textContent = getCommitLabel();
            menu.style.display = 'none';
            saveState();
            updateCommitButton();
        });
    });
}

function updateCommitButton(): void {
    const commitBtn = document.getElementById('commit-btn') as HTMLButtonElement;
    const hasMessage = commitMessage.trim().length > 0;
    const hasStaged = statusData !== null && statusData.staged.length > 0;
    commitBtn.disabled = !(hasMessage && hasStaged);
}

// ── Rendering ──

function getDisplayStatus(entry: StatusEntry, isStaged: boolean): string {
    if (entry.indexStatus === '?') { return 'U'; }
    return isStaged ? entry.indexStatus : entry.workTreeStatus;
}

function renderFilesList(): void {
    const section = document.getElementById('files-section')!;

    const hasConflicts = statusData?.conflicts && statusData.conflicts.length > 0;
    const hasStaged = statusData?.staged && statusData.staged.length > 0;
    const hasUnstaged = statusData?.unstaged && statusData.unstaged.length > 0;

    if (!statusData || (!hasConflicts && !hasStaged && !hasUnstaged)) {
        section.innerHTML = '<div class="empty-state">No changes detected</div>';
        updateCommitButton();
        return;
    }

    let html = '';

    // Conflict operation banner
    if (statusData.conflictState !== 'none') {
        const label = statusData.conflictState === 'merge' ? 'Merge' : 'Rebase';
        html += `
            <div class="conflict-banner">
                <span class="conflict-banner-text">${label} in progress</span>
                <div class="conflict-banner-actions">
                    <button class="banner-btn" id="continue-op-btn">Continue</button>
                    <button class="banner-btn secondary" id="abort-op-btn">Abort</button>
                </div>
            </div>`;
    }

    // Merge Changes (conflicts) section
    if (hasConflicts) {
        const chevron = conflictsCollapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
        html += `
            <div class="section-header conflict-section" data-section="conflicts">
                <div class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Merge Changes</span>
                    <span class="section-count conflict-count">${statusData.conflicts.length}</span>
                </div>
                <div class="section-actions">
                    <button class="icon-btn" id="accept-all-theirs-btn" title="Accept All Incoming">${ICON_ACCEPT_THEIRS}</button>
                </div>
            </div>`;

        if (!conflictsCollapsed) {
            for (const entry of statusData.conflicts) {
                html += renderConflictFileRow(entry);
            }
        }
    }

    // Staged Changes section
    if (hasStaged) {
        const chevron = stagedCollapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
        html += `
            <div class="section-header" data-section="staged">
                <div class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Staged Changes</span>
                    <span class="section-count">${statusData.staged.length}</span>
                </div>
                <div class="section-actions">
                    <button class="icon-btn" id="unstage-all-btn" title="Unstage All">${ICON_MINUS}</button>
                </div>
            </div>`;

        if (!stagedCollapsed) {
            for (const entry of statusData.staged) {
                html += renderFileRow(entry, true);
            }
        }
    }

    // Unstaged Changes section
    if (hasUnstaged) {
        const chevron = unstagedCollapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
        html += `
            <div class="section-header" data-section="unstaged">
                <div class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Changes</span>
                    <span class="section-count">${statusData.unstaged.length}</span>
                </div>
                <div class="section-actions">
                    <button class="icon-btn" id="discard-all-btn" title="Discard All Changes">${ICON_DISCARD}</button>
                    <button class="icon-btn" id="stage-all-btn" title="Stage All">${ICON_PLUS}</button>
                </div>
            </div>`;

        if (!unstagedCollapsed) {
            for (const entry of statusData.unstaged) {
                html += renderFileRow(entry, false);
            }
        }
    }

    section.innerHTML = html;
    wireFileHandlers();
    updateCommitButton();
}

function renderFileRow(entry: StatusEntry, isStaged: boolean): string {
    const statusChar = getDisplayStatus(entry, isStaged);
    const statusClass = getStatusClass(statusChar);
    const fileName = entry.filePath.split('/').pop() || entry.filePath;
    const dirPath = entry.filePath.includes('/')
        ? entry.filePath.substring(0, entry.filePath.lastIndexOf('/'))
        : '';

    const actions = isStaged
        ? `<button class="icon-btn unstage-btn" data-file="${escapeHtml(entry.filePath)}" title="Unstage">${ICON_MINUS}</button>`
        : `<button class="icon-btn discard-btn" data-file="${escapeHtml(entry.filePath)}" title="Discard Changes">${ICON_DISCARD}</button>
           <button class="icon-btn stage-btn" data-file="${escapeHtml(entry.filePath)}" title="Stage">${ICON_PLUS}</button>`;

    return `
        <div class="file-row" data-file="${escapeHtml(entry.filePath)}" data-staged="${isStaged}" data-status="${statusChar}">
            <span class="file-name" title="${escapeHtml(entry.filePath)}">${escapeHtml(fileName)}</span>
            ${dirPath ? `<span class="file-dir">${escapeHtml(dirPath)}</span>` : ''}
            <div class="file-actions">
                ${actions}
            </div>
            <span class="file-status-indicator ${statusClass}">${statusChar}</span>
        </div>`;
}

function renderConflictFileRow(entry: StatusEntry): string {
    const fileName = entry.filePath.split('/').pop() || entry.filePath;
    const dirPath = entry.filePath.includes('/')
        ? entry.filePath.substring(0, entry.filePath.lastIndexOf('/'))
        : '';

    return `
        <div class="file-row conflict-file-row" data-file="${escapeHtml(entry.filePath)}">
            <span class="file-name" title="${escapeHtml(entry.filePath)}">${escapeHtml(fileName)}</span>
            ${dirPath ? `<span class="file-dir">${escapeHtml(dirPath)}</span>` : ''}
            <div class="file-actions">
                <button class="icon-btn open-merge-btn" data-file="${escapeHtml(entry.filePath)}" title="Open in Merge Editor">${ICON_MERGE_EDITOR}</button>
                <button class="icon-btn accept-ours-btn" data-file="${escapeHtml(entry.filePath)}" title="Accept Current">${ICON_ACCEPT_OURS}</button>
                <button class="icon-btn accept-theirs-btn" data-file="${escapeHtml(entry.filePath)}" title="Accept Incoming">${ICON_ACCEPT_THEIRS}</button>
                <button class="icon-btn mark-resolved-btn" data-file="${escapeHtml(entry.filePath)}" title="Mark as Resolved (Stage)">${ICON_PLUS}</button>
            </div>
            <span class="file-status-indicator conflict">!</span>
        </div>`;
}

function wireFileHandlers(): void {
    // Section collapse toggles
    document.querySelectorAll('.section-header').forEach((el) => {
        const titleRow = el.querySelector('.section-title-row')!;
        titleRow.addEventListener('click', (e) => {
            e.stopPropagation();
            const sectionId = (el as HTMLElement).dataset.section!;
            if (sectionId === 'staged') { stagedCollapsed = !stagedCollapsed; }
            else if (sectionId === 'conflicts') { conflictsCollapsed = !conflictsCollapsed; }
            else { unstagedCollapsed = !unstagedCollapsed; }
            saveState();
            renderFilesList();
        });
    });

    // Conflict banner buttons
    document.getElementById('continue-op-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'continueOp', conflictState: statusData?.conflictState });
    });

    document.getElementById('abort-op-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'abortOp', conflictState: statusData?.conflictState });
    });

    // Accept All Incoming
    document.getElementById('accept-all-theirs-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (statusData?.conflicts) {
            for (const entry of statusData.conflicts) {
                vscode.postMessage({ type: 'acceptTheirs', filePath: entry.filePath });
            }
        }
    });

    // Per-file conflict actions
    document.querySelectorAll('.open-merge-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'openMergeEditor', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.accept-ours-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'acceptOurs', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.accept-theirs-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'acceptTheirs', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.mark-resolved-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'markResolved', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    // Clicking a conflict file row opens the merge editor
    document.querySelectorAll('.conflict-file-row').forEach((el) => {
        el.addEventListener('click', () => {
            const filePath = (el as HTMLElement).dataset.file!;
            vscode.postMessage({ type: 'openMergeEditor', filePath });
        });
    });

    document.getElementById('stage-all-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'stageAll' });
    });

    document.getElementById('unstage-all-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'unstageAll' });
    });

    document.getElementById('discard-all-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: 'discardAll' });
    });

    document.querySelectorAll('.stage-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'stageFile', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.unstage-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'unstageFile', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.discard-btn').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'discardFile', filePath: (el as HTMLElement).dataset.file! });
        });
    });

    document.querySelectorAll('.file-row').forEach((el) => {
        el.addEventListener('click', () => {
            const d = (el as HTMLElement).dataset;
            vscode.postMessage({ type: 'openDiff', filePath: d.file, isStaged: d.staged === 'true', status: d.status });
        });
    });
}

function getStatusClass(status: string): string {
    switch (status) {
        case 'A': return 'added';
        case 'M': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'U': return 'untracked';
        case '!': return 'conflict';
        default: return 'modified';
    }
}

// ── Message Handling ──

window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'statusData':
            statusData = msg.data;
            renderFilesList();
            break;
        case 'error':
            console.error('Changes error:', msg.message);
            break;
    }
});

// ── Styles ──

function injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = CSS_CONTENT;
    document.head.appendChild(style);
}

const CSS_CONTENT = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }

.changes-container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* ── Commit Section ── */
.commit-section { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; position: relative; }
.commit-section textarea { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 3px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); resize: vertical; min-height: 54px; outline: none; }
.commit-section textarea:focus { border-color: var(--vscode-focusBorder); }
.commit-section textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
.commit-actions { margin-top: 6px; }

/* Split button */
.split-btn { display: flex; width: 100%; }
.split-main { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 12px; border: none; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 3px 0 0 3px; cursor: pointer; font-size: var(--vscode-font-size); font-weight: 500; }
.split-main:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
.split-main:disabled { opacity: 0.5; cursor: default; }
.split-main svg { width: 14px; height: 14px; flex-shrink: 0; }
.split-dropdown { width: 26px; display: flex; align-items: center; justify-content: center; padding: 0; border: none; border-left: 1px solid rgba(255,255,255,0.2); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 0 3px 3px 0; cursor: pointer; }
.split-dropdown:hover { background: var(--vscode-button-hoverBackground); }
.split-dropdown svg { width: 14px; height: 14px; }

/* Dropdown menu */
.dropdown-menu { position: absolute; left: 8px; right: 8px; background: var(--vscode-menu-background, var(--vscode-dropdown-background)); border: 1px solid var(--vscode-menu-border, var(--vscode-dropdown-border)); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); z-index: 100; overflow: hidden; }
.dropdown-item { padding: 6px 12px; cursor: pointer; font-size: var(--vscode-font-size); color: var(--vscode-menu-foreground, var(--vscode-dropdown-foreground)); }
.dropdown-item:hover { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-menu-selectionForeground, var(--vscode-foreground)); }
.dropdown-item.active { font-weight: 600; }

/* ── Files Section ── */
.files-section { flex: 1; overflow-y: auto; }
.empty-state { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }

/* Section headers */
.section-header { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 4px; height: 22px; background: var(--vscode-sideBarSectionHeader-background, transparent); border-bottom: 1px solid var(--vscode-panel-border); position: sticky; top: 0; z-index: 1; }
.section-title-row { display: flex; align-items: center; gap: 2px; cursor: pointer; flex: 1; min-width: 0; user-select: none; }
.section-chevron { display: flex; align-items: center; flex-shrink: 0; }
.section-chevron svg { width: 14px; height: 14px; }
.section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground)); letter-spacing: 0.3px; }
.section-count { font-size: 10px; min-width: 16px; height: 16px; line-height: 16px; text-align: center; border-radius: 8px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 0 4px; margin-left: 4px; flex-shrink: 0; }
.section-actions { display: flex; gap: 1px; opacity: 0; transition: opacity 0.1s; }
.section-header:hover .section-actions { opacity: 1; }

/* Icon buttons */
.icon-btn { width: 22px; height: 22px; border: none; background: transparent; color: var(--vscode-icon-foreground, var(--vscode-foreground)); border-radius: 3px; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; opacity: 0.7; }
.icon-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(90, 93, 94, 0.31)); opacity: 1; }
.icon-btn svg { width: 16px; height: 16px; }

/* File rows */
.file-row { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 22px; cursor: pointer; font-size: 12px; height: 22px; }
.file-row:hover { background: var(--vscode-list-hoverBackground); }
.file-row:hover .file-actions { visibility: visible; }
.file-actions { visibility: hidden; display: flex; gap: 1px; margin-left: auto; flex-shrink: 0; }

.file-status-indicator { width: 16px; text-align: center; font-weight: 700; font-size: 11px; flex-shrink: 0; margin-left: 4px; }
.file-status-indicator.added { color: var(--vscode-gitDecoration-addedResourceForeground, #28a745); }
.file-status-indicator.modified { color: var(--vscode-gitDecoration-modifiedResourceForeground, #2188ff); }
.file-status-indicator.deleted { color: var(--vscode-gitDecoration-deletedResourceForeground, #d73a49); }
.file-status-indicator.renamed { color: var(--vscode-gitDecoration-renamedResourceForeground, #e36209); }
.file-status-indicator.untracked { color: var(--vscode-gitDecoration-untrackedResourceForeground, #73c991); }
.file-status-indicator.conflict { color: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400); font-weight: 900; }

/* Conflict banner */
.conflict-banner { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; background: var(--vscode-inputValidation-warningBackground, rgba(227, 116, 0, 0.15)); border-bottom: 1px solid var(--vscode-inputValidation-warningBorder, #e37400); gap: 8px; }
.conflict-banner-text { font-size: 12px; font-weight: 600; color: var(--vscode-foreground); white-space: nowrap; }
.conflict-banner-actions { display: flex; gap: 4px; flex-shrink: 0; }
.banner-btn { padding: 2px 10px; border: none; border-radius: 3px; font-size: 11px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
.banner-btn:hover { background: var(--vscode-button-hoverBackground); }
.banner-btn.secondary { background: var(--vscode-button-secondaryBackground, rgba(90, 93, 94, 0.4)); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); }
.banner-btn.secondary:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(90, 93, 94, 0.6)); }

/* Conflict section header */
.conflict-section .section-title { color: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400); }
.conflict-count { background: var(--vscode-gitDecoration-conflictingResourceForeground, #e37400) !important; color: #fff !important; }

.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
.file-dir { color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 2; margin-left: 4px; }
`;

// ── Boot ──

init();
