import { useState } from 'react';
import type { HistoryCommitDetails, HistoryCommitFile, HistoryFileStatus } from '../../../protocol/history/types';
import { FileTypeIcon } from '../changes/FileTypeIcon';
import { FolderIcon } from '../changes/FolderIcon';
import { iconKindForPath } from '../changes/fileIconModel';
import { depthStyle } from '../changes/viewStyles';
import { buildHistoryFileTree, type HistoryFileTreeNode } from './historyFileTree';

interface CommitHistoryFileListProps {
    readonly details: HistoryCommitDetails | undefined;
    readonly viewMode: 'list' | 'tree';
    readonly loading: boolean;
    readonly onOpenDiff: (file: HistoryCommitFile) => void;
    readonly onFileContextMenu: (file: HistoryCommitFile) => void;
}

export function CommitHistoryFileList({ details, viewMode, loading, onOpenDiff, onFileContextMenu }: CommitHistoryFileListProps) {
    if (loading) {
        return (
            <div className="history-file-loading">
                <i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" />
                <span>Loading files...</span>
            </div>
        );
    }

    if (!details) { return null; }

    if (details.files.length === 0) {
        return <div className="history-file-empty">No changed files</div>;
    }

    if (viewMode === 'list') {
        return (
            <div className="history-file-tree" role="list" aria-label="Changed files">
                {details.files.map((file) => (
                    <CommitHistoryFileRow
                        key={`${file.parentHash ?? ''}:${file.filePath}:${file.origPath ?? ''}`}
                        file={file}
                        name={file.filePath}
                        depth={0}
                        onOpenDiff={onOpenDiff}
                        onFileContextMenu={onFileContextMenu}
                    />
                ))}
            </div>
        );
    }

    const tree = buildHistoryFileTree(details.files);
    return (
        <div className="history-file-tree" role="tree" aria-label="Changed files">
            {tree.map((node) => (
                <CommitHistoryFileNode key={node.id} node={node} onOpenDiff={onOpenDiff} onFileContextMenu={onFileContextMenu} />
            ))}
        </div>
    );
}

function CommitHistoryFileNode({
    node,
    onOpenDiff,
    onFileContextMenu,
}: {
    readonly node: HistoryFileTreeNode;
    readonly onOpenDiff: (file: HistoryCommitFile) => void;
    readonly onFileContextMenu: (file: HistoryCommitFile) => void;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const expanded = !collapsed;

    if (!node.file) {
        return (
            <div className="history-file-folder">
                <div
                    className="history-file-tree-row history-file-folder-row"
                    style={depthStyle(node.depth)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => setCollapsed(!collapsed)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setCollapsed(!collapsed);
                        }
                    }}
                >
                    <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} history-file-chevron`} aria-hidden="true" />
                    <FolderIcon name={node.name} expanded={expanded} />
                    <span className="history-file-path" title={node.path}>{node.name}</span>
                    <span className="history-file-count">{countFiles(node)}</span>
                </div>
                {expanded ? node.children.map((child) => (
                    <CommitHistoryFileNode key={child.id} node={child} onOpenDiff={onOpenDiff} onFileContextMenu={onFileContextMenu} />
                )) : null}
            </div>
        );
    }

    const file = node.file;
    return (
        <CommitHistoryFileRow
            file={file}
            name={node.name}
            depth={node.depth}
            onOpenDiff={onOpenDiff}
            onFileContextMenu={onFileContextMenu}
        />
    );
}

function CommitHistoryFileRow({
    file,
    name,
    depth,
    onOpenDiff,
    onFileContextMenu,
}: {
    readonly file: HistoryCommitFile;
    readonly name: string;
    readonly depth: number;
    readonly onOpenDiff: (file: HistoryCommitFile) => void;
    readonly onFileContextMenu: (file: HistoryCommitFile) => void;
}) {
    const rowContent = (
        <>
            <span className="history-file-spacer" aria-hidden="true" />
            <span className={`history-file-status history-file-status-${statusClass(file.status)}`}>{file.status}</span>
            <FileTypeIcon kind={file.isSubmodule ? 'submodule' : iconKindForPath(file.filePath)} />
            <span className="history-file-path" title={file.filePath}>{name}</span>
            {file.origPath ? <span className="history-file-original" title={file.origPath}>{file.origPath}</span> : null}
        </>
    );

    if (file.isSubmodule) {
        return (
            <div
                className="history-file-tree-row history-file-leaf-row history-file-entry-submodule"
                style={depthStyle(depth)}
                title="Submodule diffs are not available from commit history"
                data-vscode-context={JSON.stringify({
                    webviewSection: 'historyFile',
                    historyFileDiffable: false,
                    preventDefaultContextMenuItems: true,
                })}
                onContextMenu={() => onFileContextMenu(file)}
            >
                {rowContent}
            </div>
        );
    }

    return (
        <button
            type="button"
            className="history-file-tree-row history-file-leaf-row history-file-entry-clickable"
            style={depthStyle(depth)}
            title={`Open diff for ${file.filePath}`}
            data-vscode-context={JSON.stringify({
                webviewSection: 'historyFile',
                historyFileDiffable: true,
                preventDefaultContextMenuItems: true,
            })}
            onClick={() => onOpenDiff(file)}
            onContextMenu={() => onFileContextMenu(file)}
        >
            {rowContent}
        </button>
    );
}

function countFiles(node: HistoryFileTreeNode): number {
    if (node.file) { return 1; }
    return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function statusClass(status: HistoryFileStatus): string {
    switch (status) {
        case 'A': return 'added';
        case 'M': return 'modified';
        case 'D': return 'deleted';
        case 'R': return 'renamed';
        case 'C': return 'copied';
        case 'T': return 'modified';
        case 'U': return 'conflict';
    }
}
