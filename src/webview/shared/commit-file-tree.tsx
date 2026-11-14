import { useState } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import { ViewMode } from '@webview/shared/view-mode';
import { FileTreeNodeView } from '@webview/shared/commit-file-tree-node';
import { buildFileTree, type FileTreeNode } from '@webview/shared/commit-file-tree-model';

interface CommitFileTreeProps<TFile extends CommitFileChange> {
    readonly files: readonly TFile[];
    readonly onDiff: (file: TFile) => void;
    readonly onFileContextMenu?: (file: TFile) => void;
    readonly fileContext?: Readonly<Record<string, string | boolean>>;
    readonly diffable?: boolean;
    readonly viewMode?: ViewMode;
    readonly submodulesDiffable?: boolean;
}

export function CommitFileTree<TFile extends CommitFileChange>({ files, onDiff, onFileContextMenu, fileContext, diffable = true, viewMode = ViewMode.Tree, submodulesDiffable = true }: CommitFileTreeProps<TFile>) {
    const [selectedFileId, setSelectedFileId] = useState<string | undefined>(undefined);
    const tree = viewMode === ViewMode.Tree ? buildFileTree(files) : files.map(fileListNode);
    return (
        <div className="commit-file-tree" role={viewMode === ViewMode.Tree ? 'tree' : 'list'} aria-label="Changed files">
            {tree.map((node) => (
                <FileTreeNodeView
                    key={node.id}
                    node={node}
                    depth={0}
                    onDiff={onDiff}
                    onFileContextMenu={onFileContextMenu}
                    fileContext={fileContext}
                    diffable={diffable}
                    submodulesDiffable={submodulesDiffable}
                    selectedFileId={selectedFileId}
                    onSelectFile={setSelectedFileId}
                />
            ))}
        </div>
    );
}

function fileListNode<TFile extends CommitFileChange>(file: TFile): FileTreeNode<TFile> {
    return {
        id: `${file.parentHash ?? ''}:${file.status}:${file.filePath}:${file.origPath ?? ''}`,
        name: file.filePath,
        path: file.filePath,
        file,
        children: [],
        isFolder: false,
    };
}
