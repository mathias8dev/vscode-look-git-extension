import { escapeHtml } from './graphRenderer';
import type { FileChange, FilesViewMode, GraphData } from './graphTypes';

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

const CHEVRON_RIGHT_SVG = `<svg class="tree-chevron-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 4.25 9.75 8 6 11.75" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const CHEVRON_DOWN_SVG = `<svg class="tree-chevron-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M4.25 6 8 9.75 11.75 6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const FOLDER_ICON_SVG = `<svg class="folder-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path d="M1.75 4.25A1.75 1.75 0 0 1 3.5 2.5h2.35c.46 0 .9.18 1.24.5l.84.75h4.57a1.75 1.75 0 0 1 1.75 1.75v6A1.75 1.75 0 0 1 12.5 13.25h-9a1.75 1.75 0 0 1-1.75-1.75V4.25zm1.5.25v7c0 .14.11.25.25.25h9a.25.25 0 0 0 .25-.25v-6a.25.25 0 0 0-.25-.25H7.35L6.08 4.1a.35.35 0 0 0-.23-.1H3.5a.25.25 0 0 0-.25.25z" fill="currentColor"/>
</svg>`;

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
                <button class="view-switch-btn${listActive}" data-files-mode="list" title="List view">&#9776;</button>
                <button class="view-switch-btn${treeActive}" data-files-mode="tree" title="Tree view">&#128466;</button>
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
                ${renderFileIconSvg(file.filePath)}
                <span class="file-status ${statusClass}">${file.status}</span>
                <span class="file-path">${escapeHtml(file.filePath)}</span>
            </div>`;
    }
    return html;
}

function getFileIconInfo(filePath: string): { color: string; letter: string } {
    const name = filePath.split('/').pop() || '';
    const nameLower = name.toLowerCase();

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
            const arrow = collapsed ? CHEVRON_RIGHT_SVG : CHEVRON_DOWN_SVG;
            html += `<div class="file-tree-folder" data-folder="${escapeHtml(child.fullPath)}" style="padding-left: ${indent}px;">
                <span class="tree-arrow">${arrow}</span>
                ${FOLDER_ICON_SVG}
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
        ${renderFileIconSvg(file.filePath)}
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
