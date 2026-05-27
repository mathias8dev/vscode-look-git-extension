import { escapeHtml } from './graphRenderer';
import type { FileChange, FilesViewMode, GraphData } from './graphTypes';
import {
    ICON_FOLDER,
    ICON_LIST_VIEW,
    ICON_TREE_CHEVRON_DOWN,
    ICON_TREE_CHEVRON_RIGHT,
    ICON_TREE_VIEW,
    renderFileTypeIcon,
} from '../icons/webviewIcons';

interface CommitDetailsDeps {
    getData(): GraphData | null;
    getFilesViewMode(): FilesViewMode;
    setFilesViewMode(mode: FilesViewMode): void;
    postMessage(msg: unknown): void;
}

interface FileTreeNode {
    name: string;
    fullPath: string;
    children: Map<string, FileTreeNode>;
    file?: FileChange;
}

const collapsedDetailsFolders = new Set<string>();

export function createCommitDetailsController(deps: CommitDetailsDeps): {
    render(hash: string, fullMessage: string, files: FileChange[]): void;
} {
    function render(hash: string, fullMessage: string, files: FileChange[]): void {
        const graphData = deps.getData();
        if (!graphData) { return; }

        const pane = document.getElementById('details-pane')!;
        pane.classList.remove('empty');

        const row = graphData.rows.find((r) => r.commit.hash === hash);
        if (!row) { return; }

        const c = row.commit;
        const filesMode = deps.getFilesViewMode();
        const listActive = filesMode === 'list' ? ' active' : '';
        const treeActive = filesMode === 'tree' ? ' active' : '';

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
                    <span class="value">${new Date(c.authorDate).toLocaleString()}</span>
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

        html += `<div class="details-files-toolbar">
            <span class="details-files-header">Changed Files (${files.length})</span>
            <div class="view-switcher">
                <button class="view-switch-btn${listActive}" data-files-mode="list" title="List view">${ICON_LIST_VIEW}</button>
                <button class="view-switch-btn${treeActive}" data-files-mode="tree" title="Tree view">${ICON_TREE_VIEW}</button>
            </div>
        </div>`;

        html += filesMode === 'list'
            ? renderFileList(hash, files)
            : renderFileTreeNodes(collapseFileTree(buildFileTree(files)), hash, 0);

        pane.innerHTML = html;
        wireDetailsPaneHandlers(pane, hash, fullMessage, files, deps, render);
    }

    return { render };
}

function renderFileList(hash: string, files: FileChange[]): string {
    let html = '';
    for (const file of files) {
        const statusClass = getStatusClass(file.status);
        const origAttr = file.origPath ? ` data-orig="${escapeHtml(file.origPath)}"` : '';
        const parentAttr = file.parentHash ? ` data-parent="${escapeHtml(file.parentHash)}"` : '';
        html += `
            <div class="file-item" data-file="${escapeHtml(file.filePath)}"${origAttr}${parentAttr} data-status="${file.status}" data-hash="${hash}">
                ${renderFileTypeIcon(file.filePath)}
                <span class="file-status ${statusClass}">${file.status}</span>
                <span class="file-path">${escapeHtml(file.filePath)}</span>
            </div>`;
    }
    return html;
}

function buildFileTree(files: FileChange[]): FileTreeNode {
    const root: FileTreeNode = { name: '', fullPath: '', children: new Map() };

    for (const file of files) {
        const segments = file.filePath.split('/');
        let node = root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const path = segments.slice(0, i + 1).join('/');

            if (!node.children.has(segment)) {
                node.children.set(segment, {
                    name: segment,
                    fullPath: path,
                    children: new Map(),
                });
            }
            node = node.children.get(segment)!;
        }

        node.file = file;
    }

    return root;
}

function collapseFileTree(node: FileTreeNode): FileTreeNode {
    for (const [key, child] of node.children) {
        node.children.set(key, collapseFileTree(child));
    }

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
            const arrow = collapsed ? ICON_TREE_CHEVRON_RIGHT : ICON_TREE_CHEVRON_DOWN;
            html += `<div class="file-tree-folder" data-folder="${escapeHtml(child.fullPath)}" style="padding-left: ${indent}px;">
                <span class="tree-arrow">${arrow}</span>
                ${ICON_FOLDER}
                <span class="file-tree-folder-name">${escapeHtml(child.name)}</span>
            </div>`;

            if (!collapsed) {
                html += renderFileTreeNodes(child, hash, depth + 1);
            }
        } else if (child.file) {
            html += renderFileTreeItem(child.file, child.name, hash, indent);
        }

        if (isFolder && child.file) {
            html += renderFileTreeItem(child.file, child.name, hash, (depth + 1) * 16);
        }
    }

    return html;
}

function renderFileTreeItem(file: FileChange, label: string, hash: string, indent: number): string {
    const statusClass = getStatusClass(file.status);
    const origAttr = file.origPath ? ` data-orig="${escapeHtml(file.origPath)}"` : '';
    const parentAttr = file.parentHash ? ` data-parent="${escapeHtml(file.parentHash)}"` : '';
    return `<div class="file-item file-tree-item" data-file="${escapeHtml(file.filePath)}"${origAttr}${parentAttr} data-status="${escapeHtml(file.status)}" data-hash="${escapeHtml(hash)}" style="padding-left: ${indent}px;">
        ${renderFileTypeIcon(file.filePath)}
        <span class="file-path">${escapeHtml(label)}</span>
        <span class="file-status-badge ${statusClass}">${escapeHtml(file.status)}</span>
    </div>`;
}

function wireDetailsPaneHandlers(
    pane: HTMLElement,
    hash: string,
    fullMessage: string,
    files: FileChange[],
    deps: CommitDetailsDeps,
    render: (hash: string, fullMessage: string, files: FileChange[]) => void,
): void {
    pane.querySelectorAll('[data-files-mode]').forEach((el) => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            deps.setFilesViewMode((el as HTMLElement).dataset.filesMode as FilesViewMode);
            render(hash, fullMessage, files);
        });
    });

    pane.querySelectorAll('.file-tree-folder').forEach((el) => {
        el.addEventListener('click', () => {
            const folder = (el as HTMLElement).dataset.folder!;
            if (collapsedDetailsFolders.has(folder)) {
                collapsedDetailsFolders.delete(folder);
            } else {
                collapsedDetailsFolders.add(folder);
            }
            render(hash, fullMessage, files);
        });
    });

    pane.querySelectorAll('.file-item').forEach((el) => {
        el.addEventListener('click', () => {
            const d = (el as HTMLElement).dataset;
            deps.postMessage({
                type: 'openDiff',
                filePath: d.file,
                origPath: d.orig,
                parentHash: d.parent,
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
