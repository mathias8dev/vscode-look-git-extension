import { useState } from 'react';
import type { CommitFileChange } from '../../../protocol/graph/types';
import { ViewMode } from '../../shared/viewMode';
import { FileTreeNodeView } from './FileTreeNode';
import { buildFileTree, type FileTreeNode } from './commitFileTreeModel';

interface CommitFileTreeProps {
    readonly files: readonly CommitFileChange[];
    readonly onDiff: (file: CommitFileChange) => void;
    readonly diffable?: boolean;
    readonly viewMode?: ViewMode;
}

export function CommitFileTree({ files, onDiff, diffable = true, viewMode = ViewMode.Tree }: CommitFileTreeProps) {
    const [selectedFileId, setSelectedFileId] = useState<string | undefined>(undefined);
    const tree = viewMode === ViewMode.Tree ? buildFileTree(files) : files.map(fileListNode);
    return (
        <div className="commit-file-tree">
            {tree.map((node) => (
                <FileTreeNodeView
                    key={node.id}
                    node={node}
                    depth={0}
                    onDiff={onDiff}
                    diffable={diffable}
                    selectedFileId={selectedFileId}
                    onSelectFile={setSelectedFileId}
                />
            ))}
        </div>
    );
}

function fileListNode(file: CommitFileChange): FileTreeNode {
    return {
        id: `${file.parentHash ?? ''}:${file.status}:${file.filePath}:${file.origPath ?? ''}`,
        name: file.filePath,
        path: file.filePath,
        file,
        children: [],
        isFolder: false,
    };
}
