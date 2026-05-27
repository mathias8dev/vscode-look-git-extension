import { buildPathTree, sortedPathChildren, type PathTreeNode } from './pathTree';
import { StashFileState } from './stashState';
import { replaceWindowMessageHandler } from './windowMessages';
import { wireFileSectionHandlers } from './changesInteractions';
import { CHANGES_CSS_CONTENT } from './changesStyles';
import { escapeHtml, getStatusClass } from './changesFormat';
import { COMMIT_MODES } from './changesCommitModes';
import {
    ICON_ACCEPT_OURS,
    ICON_ACCEPT_THEIRS,
    ICON_CHECK,
    ICON_CHEVRON_DOWN,
    ICON_CHEVRON_RIGHT,
    ICON_DISCARD,
    ICON_DROPDOWN,
    ICON_FILE,
    ICON_FOLDER,
    ICON_FOLDER_OPEN,
    ICON_MERGE_EDITOR,
    ICON_MINUS,
    ICON_OPEN_FILE,
    ICON_PLUS,
    ICON_STASH_APPLY,
    ICON_STASH_POP,
    ICON_STASH_SAVE,
    ICON_TRASH,
} from '../icons/webviewIcons';
import type {
    StatusData,
    StatusEntry,
    StashEntry,
    StashFileEntry,
    ViewState,
} from './changesTypes';

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

let statusData: StatusData | null = null;
let commitMessage = '';
let commitMode = 'commit';
let stagedCollapsed = false;
let unstagedCollapsed = false;
let conflictsCollapsed = false;
let stashesCollapsed = true;
let viewAsTree = false;

const stashFileState = new StashFileState<StashFileEntry>();
const expandedFolders = new Set<string>();

function loadState(): void {
    const state = vscode.getState() as ViewState | null;
    if (state) {
        commitMessage = state.commitMessage || '';
        commitMode = state.commitMode || 'commit';
        stagedCollapsed = state.stagedCollapsed ?? false;
        unstagedCollapsed = state.unstagedCollapsed ?? false;
        conflictsCollapsed = state.conflictsCollapsed ?? false;
        stashesCollapsed = state.stashesCollapsed ?? true;
        viewAsTree = state.viewAsTree ?? false;
        if (state.expandedFolders) {
            for (const f of state.expandedFolders) { expandedFolders.add(f); }
        }
    }
}

function saveState(): void {
    vscode.setState({
        commitMessage, commitMode, stagedCollapsed, unstagedCollapsed,
        conflictsCollapsed, stashesCollapsed, viewAsTree,
        expandedFolders: [...expandedFolders],
    });
}

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
    vscode.postMessage({ type: 'viewModeChanged', asTree: viewAsTree });
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
                    <p id="commit-hint" class="commit-hint"></p>
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
        commitBtn.disabled = true;
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
        html += `<button type="button" class="dropdown-item${active}" data-mode="${mode.id}">${mode.label}</button>`;
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
    const hint = document.getElementById('commit-hint');
    const hasMessage = commitMessage.trim().length > 0;
    const hasStaged = statusData !== null && statusData.staged.length > 0;
    commitBtn.disabled = !(hasMessage && hasStaged);
    if (hint) {
        if (!hasStaged && !hasMessage) {
            hint.textContent = 'Stage changes and enter a message to commit.';
        } else if (!hasStaged) {
            hint.textContent = 'No staged changes to commit.';
        } else if (!hasMessage) {
            hint.textContent = 'Enter a commit message.';
        } else {
            hint.textContent = '';
        }
    }
}

// ── Rendering ──

function getDisplayStatus(entry: StatusEntry, isStaged: boolean): string {
    if (entry.indexStatus === '?') { return 'U'; }
    return isStaged ? entry.indexStatus : entry.workTreeStatus;
}

// ── Tree View ──

function renderTreeSection(entries: StatusEntry[], isStaged: boolean): string {
    const tree = buildPathTree(entries, (entry) => entry.filePath);
    let html = '';

    const sortedChildren = sortedPathChildren(tree);
    const sortedEntries = [...tree.entries].sort((a, b) => a.filePath.localeCompare(b.filePath));

    for (const child of sortedChildren) {
        html += renderTreeNode(child, isStaged, 0);
    }
    for (const entry of sortedEntries) {
        html += renderTreeFileRow(entry, isStaged, 0);
    }
    return html;
}

function renderTreeNode(node: PathTreeNode<StatusEntry>, isStaged: boolean, depth: number): string {
    const folderKey = (isStaged ? 'staged:' : 'unstaged:') + node.fullPath;
    const isExpanded = expandedFolders.has(folderKey);
    const chevron = isExpanded ? ICON_CHEVRON_DOWN : ICON_CHEVRON_RIGHT;
    const indent = depth * 16 + 22;

    const folderIcon = isExpanded ? ICON_FOLDER_OPEN : ICON_FOLDER;
    let html = `
        <button type="button" class="tree-folder-row" data-folder-key="${escapeHtml(folderKey)}" style="padding-left:${indent}px">
            <span class="tree-folder-chevron">${chevron}</span>
            <span class="tree-icon folder-icon">${folderIcon}</span>
            <span class="tree-folder-name">${escapeHtml(node.name)}</span>
        </button>`;

    if (isExpanded) {
        const sortedChildren = sortedPathChildren(node);
        const sortedEntries = [...node.entries].sort((a, b) => a.filePath.localeCompare(b.filePath));

        for (const child of sortedChildren) {
            html += renderTreeNode(child, isStaged, depth + 1);
        }
        for (const entry of sortedEntries) {
            html += renderTreeFileRow(entry, isStaged, depth + 1);
        }
    }

    return html;
}

function renderTreeFileRow(entry: StatusEntry, isStaged: boolean, depth: number): string {
    const statusChar = getDisplayStatus(entry, isStaged);
    const statusClass = getStatusClass(statusChar);
    const fileName = entry.filePath.split('/').pop() || entry.filePath;
    const indent = depth * 16 + 22;

    const openFileBtn = `<button class="icon-btn open-file-btn" data-file="${escapeHtml(entry.filePath)}" title="Open File">${ICON_OPEN_FILE}</button>`;

    const actions = isStaged
        ? `${openFileBtn}<button class="icon-btn unstage-btn" data-file="${escapeHtml(entry.filePath)}" title="Unstage">${ICON_MINUS}</button>`
        : `${openFileBtn}<button class="icon-btn discard-btn" data-file="${escapeHtml(entry.filePath)}" title="Discard Changes">${ICON_DISCARD}</button>
           <button class="icon-btn stage-btn" data-file="${escapeHtml(entry.filePath)}" title="Stage">${ICON_PLUS}</button>`;

    const origAttr = entry.origPath ? ` data-orig="${escapeHtml(entry.origPath)}"` : '';
    return `
        <div class="file-row tree-file-row" data-file="${escapeHtml(entry.filePath)}"${origAttr} data-staged="${isStaged}" data-status="${statusChar}" style="padding-left:${indent}px">
            <span class="tree-icon file-icon">${ICON_FILE}</span>
            <span class="file-name" title="${escapeHtml(entry.filePath)}">${escapeHtml(fileName)}</span>
            <div class="file-actions">
                ${actions}
            </div>
            <span class="file-status-indicator ${statusClass}">${statusChar}</span>
        </div>`;
}

function renderFilesList(): void {
    const section = document.getElementById('files-section')!;

    const hasConflicts = statusData?.conflicts && statusData.conflicts.length > 0;
    const hasStaged = statusData?.staged && statusData.staged.length > 0;
    const hasUnstaged = statusData?.unstaged && statusData.unstaged.length > 0;

    const hasStashes = statusData?.stashes && statusData.stashes.length > 0;

    if (!statusData || (!hasConflicts && !hasStaged && !hasUnstaged && !hasStashes)) {
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
                <button type="button" class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Merge Changes</span>
                    <span class="section-count conflict-count">${statusData.conflicts.length}</span>
                </button>
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
                <button type="button" class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Staged Changes</span>
                    <span class="section-count">${statusData.staged.length}</span>
                </button>
                <div class="section-actions">
                    <button class="icon-btn" id="stash-staged-btn" title="Stash Staged Changes">${ICON_STASH_SAVE}</button>
                    <button class="icon-btn" id="unstage-all-btn" title="Unstage All">${ICON_MINUS}</button>
                </div>
            </div>`;

        if (!stagedCollapsed) {
            if (viewAsTree) {
                html += renderTreeSection(statusData.staged, true);
            } else {
                for (const entry of statusData.staged) {
                    html += renderFileRow(entry, true);
                }
            }
        }
    }

    // Unstaged Changes section
    if (hasUnstaged) {
        const chevron = unstagedCollapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
        html += `
            <div class="section-header" data-section="unstaged">
                <button type="button" class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Changes</span>
                    <span class="section-count">${statusData.unstaged.length}</span>
                </button>
                <div class="section-actions">
                    <button class="icon-btn stash-btn" id="stash-btn" title="Stash Changes">${ICON_STASH_SAVE}</button>
                    <button class="icon-btn" id="discard-all-btn" title="Discard All Changes">${ICON_DISCARD}</button>
                    <button class="icon-btn" id="stage-all-btn" title="Stage All">${ICON_PLUS}</button>
                </div>
            </div>`;

        if (!unstagedCollapsed) {
            if (viewAsTree) {
                html += renderTreeSection(statusData.unstaged, false);
            } else {
                for (const entry of statusData.unstaged) {
                    html += renderFileRow(entry, false);
                }
            }
        }
    }

    // Stashes section
    if (hasStashes) {
        const chevron = stashesCollapsed ? ICON_CHEVRON_RIGHT : ICON_CHEVRON_DOWN;
        html += `
            <div class="section-header" data-section="stashes">
                <button type="button" class="section-title-row">
                    <span class="section-chevron">${chevron}</span>
                    <span class="section-title">Stashes</span>
                    <span class="section-count">${statusData!.stashes.length}</span>
                </button>
            </div>`;

        if (!stashesCollapsed) {
            for (const stash of statusData!.stashes) {
                html += renderStashRow(stash);
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

    const openFileBtn = `<button class="icon-btn open-file-btn" data-file="${escapeHtml(entry.filePath)}" title="Open File">${ICON_OPEN_FILE}</button>`;

    const actions = isStaged
        ? `${openFileBtn}<button class="icon-btn unstage-btn" data-file="${escapeHtml(entry.filePath)}" title="Unstage">${ICON_MINUS}</button>`
        : `${openFileBtn}<button class="icon-btn discard-btn" data-file="${escapeHtml(entry.filePath)}" title="Discard Changes">${ICON_DISCARD}</button>
           <button class="icon-btn stage-btn" data-file="${escapeHtml(entry.filePath)}" title="Stage">${ICON_PLUS}</button>`;

    const origAttr = entry.origPath ? ` data-orig="${escapeHtml(entry.origPath)}"` : '';
    return `
        <div class="file-row" data-file="${escapeHtml(entry.filePath)}"${origAttr} data-staged="${isStaged}" data-status="${statusChar}">
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

function renderStashRow(stash: StashEntry): string {
    const isExpanded = stashFileState.isExpanded(stash.index);
    const chevron = isExpanded ? ICON_CHEVRON_DOWN : ICON_CHEVRON_RIGHT;
    let html = `
        <div class="file-row stash-row" data-stash-index="${stash.index}">
            <button type="button" class="stash-expand-btn" data-stash-index="${stash.index}">
                <span class="stash-chevron">${chevron}</span>
                <span class="stash-label">stash@{${stash.index}}</span>
                <span class="file-name" title="${escapeHtml(stash.message)}">${escapeHtml(stash.message)}</span>
            </button>
            <div class="file-actions">
                <button class="icon-btn stash-pop-btn" data-index="${stash.index}" title="Pop Stash">${ICON_STASH_POP}</button>
                <button class="icon-btn stash-apply-btn" data-index="${stash.index}" title="Apply Stash">${ICON_STASH_APPLY}</button>
                <button class="icon-btn stash-drop-btn" data-index="${stash.index}" title="Drop Stash">${ICON_TRASH}</button>
            </div>
        </div>`;

    if (isExpanded) {
        const files = stashFileState.getFiles(stash.index);
        if (files) {
            for (const file of files) {
                html += renderStashFileRow(stash.index, file);
            }
        } else {
            html += `<div class="stash-loading">Loading...</div>`;
        }
    }

    return html;
}

function renderStashFileRow(stashIndex: number, file: StashFileEntry): string {
    const statusClass = getStatusClass(file.status);
    const fileName = file.filePath.split('/').pop() || file.filePath;
    const dirPath = file.filePath.includes('/')
        ? file.filePath.substring(0, file.filePath.lastIndexOf('/'))
        : '';

    const origAttr = file.origPath ? ` data-orig="${escapeHtml(file.origPath)}"` : '';
    return `
        <div class="file-row stash-file-row" data-stash-index="${stashIndex}" data-file="${escapeHtml(file.filePath)}"${origAttr} data-status="${file.status}">
            <span class="file-name" title="${escapeHtml(file.filePath)}">${escapeHtml(fileName)}</span>
            ${dirPath ? `<span class="file-dir">${escapeHtml(dirPath)}</span>` : ''}
            <span class="file-status-indicator ${statusClass}">${file.status}</span>
        </div>`;
}

function wireFileHandlers(): void {
    const section = document.getElementById('files-section');
    if (!section) {
        return;
    }

    wireFileSectionHandlers(section, {
        postMessage: (msg) => vscode.postMessage(msg),
        getConflictState: () => statusData?.conflictState ?? 'none',
        toggleSection,
        toggleTreeFolder,
        toggleStash,
    });
}

function toggleSection(sectionId: string | undefined): void {
    if (sectionId === 'staged') { stagedCollapsed = !stagedCollapsed; }
    else if (sectionId === 'conflicts') { conflictsCollapsed = !conflictsCollapsed; }
    else if (sectionId === 'stashes') { stashesCollapsed = !stashesCollapsed; }
    else { unstagedCollapsed = !unstagedCollapsed; }
    saveState();
    renderFilesList();
}

function toggleTreeFolder(key: string): void {
    if (expandedFolders.has(key)) {
        expandedFolders.delete(key);
    } else {
        expandedFolders.add(key);
    }
    saveState();
    renderFilesList();
}

function toggleStash(rawIndex: string): void {
    const index = Number.parseInt(rawIndex, 10);
    const result = stashFileState.toggle(index);
    if (result.shouldRequestFiles) {
        vscode.postMessage({ type: 'getStashFiles', index });
    }
    renderFilesList();
}

// ── Message Handling ──

replaceWindowMessageHandler('changes', (event) => {
    const msg = event.data;
    switch (msg.type) {
        case 'statusData':
            statusData = msg.data as StatusData;
            statusData.stashes ??= [];
            stashFileState.sync(statusData.stashes);
            renderFilesList();
            break;
        case 'stashFiles':
            stashFileState.setFiles(msg.index as number, msg.files as StashFileEntry[]);
            renderFilesList();
            break;
        case 'setViewMode':
            viewAsTree = msg.asTree as boolean;
            saveState();
            renderFilesList();
            break;
        case 'commitResult':
            if (msg.success === true) {
                commitMessage = '';
                const textarea = document.getElementById('commit-message') as HTMLTextAreaElement | null;
                if (textarea) { textarea.value = ''; }
                saveState();
            }
            updateCommitButton();
            break;
        case 'error':
            console.error('Changes error:', msg.message);
            break;
    }
});

// ── Styles ──

function injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = CHANGES_CSS_CONTENT;
    document.head.appendChild(style);
}


// ── Boot ──

init();
