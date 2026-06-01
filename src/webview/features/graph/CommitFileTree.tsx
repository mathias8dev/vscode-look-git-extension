import type { CommitFileChange } from '../../../protocol/graph/types';
import { FileTreeNodeView } from './FileTreeNode';
import { buildFileTree } from './commitFileTreeModel';

interface CommitFileTreeProps {
    readonly files: readonly CommitFileChange[];
    readonly onDiff: (file: CommitFileChange) => void;
}

export function CommitFileTree({ files, onDiff }: CommitFileTreeProps) {
    const tree = buildFileTree(files);
    return (
        <div className="commit-file-tree">
            {tree.map((node) => (
                <FileTreeNodeView
                    key={node.id}
                    node={node}
                    depth={0}
                    onDiff={onDiff}
                />
            ))}
        </div>
    );
}
