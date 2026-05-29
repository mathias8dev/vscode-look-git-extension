import type { ChangeRowAction } from './changeCommands';
import type { ChangeListItem, ChangeTreeNode } from './changeTree';
import type { ChangeSelectionMode } from './changesState';
import { ChangeRow } from './ChangeRow';
import { depthStyle } from './viewStyles';

interface TreeNodeViewProps {
    readonly node: ChangeTreeNode;
    readonly selectedItemIds: ReadonlySet<string>;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
}

export function TreeNodeView({ node, selectedItemIds, onSelectItem, onRowAction }: TreeNodeViewProps) {
    if (node.item) {
        return (
            <ChangeRow
                item={node.item}
                depth={node.depth}
                selected={selectedItemIds.has(node.item.id)}
                onSelect={onSelectItem}
                onAction={onRowAction}
            />
        );
    }
    return (
        <div>
            <div className="change-row folder-row" style={depthStyle(node.depth)}>
                <span className="file-mark" aria-hidden="true" />
                <span className="file-main">{node.name}</span>
            </div>
            {node.children.map((child) => (
                <TreeNodeView
                    key={child.id}
                    node={child}
                    selectedItemIds={selectedItemIds}
                    onSelectItem={onSelectItem}
                    onRowAction={onRowAction}
                />
            ))}
        </div>
    );
}
