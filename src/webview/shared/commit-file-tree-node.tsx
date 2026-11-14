import { useState } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import { IconButton } from '@webview/shared/icon-button';
import { CommitFileTypeIcon } from '@webview/shared/commit-file-type-icon';
import { iconKindForCommitFile } from '@webview/shared/commit-file-icon-model';
import type { FileTreeNode } from '@webview/shared/commit-file-tree-model';
import { FolderIcon } from '@webview/shared/folder-icon';

interface FileTreeNodeViewProps<TFile extends CommitFileChange> {
    readonly node: FileTreeNode<TFile>;
    readonly depth: number;
    readonly onDiff: (file: TFile) => void;
    readonly onFileContextMenu?: (file: TFile) => void;
    readonly fileContext?: Readonly<Record<string, string | boolean>>;
    readonly diffable?: boolean;
    readonly submodulesDiffable?: boolean;
    readonly selectedFileId?: string;
    readonly onSelectFile?: (fileId: string) => void;
}

export function FileTreeNodeView<TFile extends CommitFileChange>({ node, depth, onDiff, onFileContextMenu, fileContext, diffable = true, submodulesDiffable = true, selectedFileId, onSelectFile }: FileTreeNodeViewProps<TFile>) {
    const [collapsed, setCollapsed] = useState(false);
    const indent = depth * 14 + 10;

    if (node.isFolder) {
        return (
            <div className="commit-file-folder">
                <button
                    type="button"
                    className="commit-file-node commit-file-folder-header"
                    style={{ paddingLeft: `${indent}px` }}
                    aria-expanded={!collapsed}
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <i
                        className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} file-tree-chevron`}
                        aria-hidden="true"
                    />
                    <FolderIcon name={node.name} expanded={!collapsed} />
                    <span className="commit-file-name">{node.name}</span>
                    <span className="commit-file-count">{countFiles(node)}</span>
                </button>
                {!collapsed && node.children.map((child) => (
                    <FileTreeNodeView
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        onDiff={onDiff}
                        onFileContextMenu={onFileContextMenu}
                        fileContext={fileContext}
                        diffable={diffable}
                        submodulesDiffable={submodulesDiffable}
                        selectedFileId={selectedFileId}
                        onSelectFile={onSelectFile}
                    />
                ))}
            </div>
        );
    }

    const file = node.file;
    if (!file) { return null; }
    const canDiff = diffable && (!file.isSubmodule || submodulesDiffable);
    const statusKind = fileStatusKind(file.status);
    const kind = iconKindForCommitFile(file);
    const openDiff = () => {
        onSelectFile?.(node.id);
        onDiff(file);
    };
    const classes = [
        'commit-file-node',
        'commit-file-leaf',
        canDiff ? 'commit-file-leaf-clickable' : undefined,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={{ paddingLeft: `${indent}px` }}
            title={canDiff ? `Open diff for ${file.filePath}` : undefined}
            data-vscode-context={fileContext ? JSON.stringify(fileContext) : undefined}
            tabIndex={canDiff ? 0 : undefined}
            role={canDiff ? 'button' : undefined}
            aria-selected={selectedFileId === node.id}
            onClick={canDiff ? openDiff : undefined}
            onContextMenu={onFileContextMenu ? () => onFileContextMenu(file) : undefined}
            onKeyDown={(e) => {
                if (canDiff && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDiff(); }
            }}
        >
            <CommitFileTypeIcon kind={kind} />
            <span className="commit-file-name" title={file.filePath}>{node.name}</span>
            {file.origPath ? <span className="commit-file-original" title={file.origPath}>{file.origPath}</span> : null}
            {canDiff ? (
                <div className="commit-file-actions">
                    <IconButton
                        icon="diff"
                        title="Open diff"
                        onClick={(e) => { e.stopPropagation(); openDiff(); }}
                    />
                </div>
            ) : null}
            <span className={`status-letter status-letter-${statusKind}`} aria-hidden="true">
                {file.status.charAt(0).toUpperCase()}
            </span>
        </div>
    );
}

function countFiles<TFile extends CommitFileChange>(node: FileTreeNode<TFile>): number {
    if (!node.isFolder) { return 1; }
    return node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

function fileStatusKind(status: string): string {
    const s = status.charAt(0).toUpperCase();
    if (s === 'A') { return 'added'; }
    if (s === '?') { return 'untracked'; }
    if (s === 'U') { return 'conflict'; }
    if (s === 'D') { return 'deleted'; }
    if (s === 'R') { return 'renamed'; }
    return 'modified';
}
