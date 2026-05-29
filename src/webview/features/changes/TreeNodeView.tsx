import type { ChangeTreeNode } from './changeTree';
import { ChangeRow } from './ChangeRow';
import { depthStyle } from './viewStyles';

interface TreeNodeViewProps {
    readonly node: ChangeTreeNode;
}

export function TreeNodeView({ node }: TreeNodeViewProps) {
    if (node.item) { return <ChangeRow item={node.item} depth={node.depth} />; }
    return (
        <div>
            <div className="change-row folder-row" style={depthStyle(node.depth)}>
                <span className="file-mark" aria-hidden="true" />
                <span className="file-main">{node.name}</span>
            </div>
            {node.children.map((child) => <TreeNodeView key={child.id} node={child} />)}
        </div>
    );
}
