import { useState } from 'react';
import { FolderIcon } from '@webview/shared/FolderIcon';
import { depthStyle } from '@webview/shared/viewStyles';
import type { ChangeRowAction } from '@webview/features/changes/changeCommands';
import type { ChangeListItem, ChangeTreeNode } from '@webview/features/changes/changeTree';
import type { ChangeSelectionMode } from '@webview/features/changes/changesState';
import { ChangeRow } from '@webview/features/changes/ChangeRow';
import { changesItemContext } from '@webview/features/changes/context-menu-model';

interface TreeNodeViewProps {
    readonly node: ChangeTreeNode;
    readonly selectedItemIds: ReadonlySet<string>;
    readonly contextForItem: (item: ChangeListItem) => string;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onOpenSelectionContext: (item: ChangeListItem) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
}

export function TreeNodeView({ node, selectedItemIds, contextForItem, onSelectItem, onOpenSelectionContext, onRowAction }: TreeNodeViewProps) {
    const [folderCollapsed, setFolderCollapsed] = useState(false);

    if (node.item) {
        return (
            <ChangeRow
                item={node.item}
                depth={node.depth}
                selected={selectedItemIds.has(node.item.id)}
                context={contextForItem(node.item)}
                onSelect={onSelectItem}
                onOpenContextMenu={onOpenSelectionContext}
                onAction={onRowAction}
            />
        );
    }
    return (
        <div>
            <div
                className="change-row folder-row"
                data-vscode-context={changesItemContext()}
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
                <FolderIcon name={node.name} expanded={!folderCollapsed} />
                <span className="file-name">{node.name}</span>
            </div>
            {!folderCollapsed ? node.children.map((child) => (
                <TreeNodeView
                    key={child.id}
                    node={child}
                    selectedItemIds={selectedItemIds}
                    contextForItem={contextForItem}
                    onSelectItem={onSelectItem}
                    onOpenSelectionContext={onOpenSelectionContext}
                    onRowAction={onRowAction}
                />
            )) : null}
        </div>
    );
}
