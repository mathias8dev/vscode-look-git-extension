import { useState } from 'react';
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
    const [folderCollapsed, setFolderCollapsed] = useState(false);

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
            <div
                className="change-row folder-row"
                style={depthStyle(node.depth)}
                role="button"
                tabIndex={0}
                aria-expanded={!folderCollapsed}
                onClick={() => setFolderCollapsed(!folderCollapsed)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setFolderCollapsed(!folderCollapsed);
                    }
                }}
            >
                <i
                    className={`codicon codicon-chevron-${folderCollapsed ? 'right' : 'down'} folder-chevron`}
                    aria-hidden="true"
                />
                <span className="file-name">{node.name}</span>
            </div>
            {!folderCollapsed ? node.children.map((child) => (
                <TreeNodeView
                    key={child.id}
                    node={child}
                    selectedItemIds={selectedItemIds}
                    onSelectItem={onSelectItem}
                    onRowAction={onRowAction}
                />
            )) : null}
        </div>
    );
}
