import { useState } from 'react';
import type { CommitFileChange } from '../../../protocol/graph/types';
import { IconButton } from '../../shared/IconButton';
import { GraphFileTypeIcon } from './GraphFileTypeIcon';
import { iconKindForCommitFile } from './graphFileIconModel';
import type { FileTreeNode } from './commitFileTreeModel';

interface FileTreeNodeViewProps {
    readonly node: FileTreeNode;
    readonly depth: number;
    readonly onDiff: (file: CommitFileChange) => void;
    readonly diffable?: boolean;
    readonly selectedFileId?: string;
    readonly onSelectFile?: (fileId: string) => void;
}

export function FileTreeNodeView({ node, depth, onDiff, diffable = true, selectedFileId, onSelectFile }: FileTreeNodeViewProps) {
    const [collapsed, setCollapsed] = useState(false);
    const indent = depth * 14 + 10;

    if (node.isFolder) {
        return (
            <div className="commit-file-folder">
                <button
                    type="button"
                    className="commit-file-node commit-file-folder-header"
                    style={{ paddingLeft: `${indent}px` }}
                    onClick={() => setCollapsed(!collapsed)}
                >
                    <i
                        className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'} file-tree-chevron`}
                        aria-hidden="true"
                    />
                    <i
                        className={`codicon codicon-folder${collapsed ? '' : '-opened'} file-tree-folder-icon`}
                        aria-hidden="true"
                    />
                    <span className="commit-file-name">{node.name}</span>
                    <span className="commit-file-count">{countFiles(node)}</span>
                </button>
                {!collapsed && node.children.map((child) => (
                    <FileTreeNodeView
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        onDiff={onDiff}
                        diffable={diffable}
                        selectedFileId={selectedFileId}
                        onSelectFile={onSelectFile}
                    />
                ))}
            </div>
        );
    }

    const file = node.file;
    if (!file) { return null; }
    const statusKind = fileStatusKind(file.status);
    const kind = iconKindForCommitFile(file);
    const openDiff = () => {
        onSelectFile?.(node.id);
        onDiff(file);
    };
    const classes = [
        'commit-file-node',
        'commit-file-leaf',
        diffable ? 'commit-file-leaf-clickable' : undefined,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classes}
            style={{ paddingLeft: `${indent}px` }}
            title={file.filePath}
            tabIndex={diffable ? 0 : undefined}
            role={diffable ? 'button' : undefined}
            aria-selected={selectedFileId === node.id}
            onClick={diffable ? openDiff : undefined}
            onKeyDown={(e) => {
                if (diffable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDiff(); }
            }}
        >
            <GraphFileTypeIcon kind={kind} />
            <span className="commit-file-name">{node.name}</span>
            {diffable ? (
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

function countFiles(node: FileTreeNode): number {
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
