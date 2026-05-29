import { useState } from 'react';
import { IconButton } from '../../shared/IconButton';
import { bulkActionsFor, type ChangeBulkAction, type ChangeRowAction } from './changeCommands';
import { buildChangeTree, type ChangeListItem, type ChangeSection } from './changeTree';
import { ChangesViewMode, type ChangeSelectionMode } from './changesState';
import { CHANGE_SECTION_PAGE_SIZE, visibleChangeItems } from './changePagination';
import { ChangeRow } from './ChangeRow';
import { TreeNodeView } from './TreeNodeView';

interface ChangeSectionViewProps {
    readonly section: ChangeSection;
    readonly viewMode: ChangesViewMode;
    readonly collapsed: boolean;
    readonly selectedItemIds: ReadonlySet<string>;
    readonly onToggleCollapsed: () => void;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (action: ChangeBulkAction) => void;
}

export function ChangeSectionView({
    section,
    viewMode,
    collapsed,
    selectedItemIds,
    onToggleCollapsed,
    onSelectItem,
    onRowAction,
    onBulkAction,
}: ChangeSectionViewProps) {
    const [visibleLimit, setVisibleLimit] = useState(CHANGE_SECTION_PAGE_SIZE);
    if (section.items.length === 0) { return null; }
    const visible = visibleChangeItems(section.items, visibleLimit);
    const tree = buildChangeTree(visible.items);
    const bulkActions = bulkActionsFor(section);
    return (
        <section className="change-section" aria-labelledby={`${section.id}-title`}>
            <header className="change-section-header">
                <IconButton
                    icon={collapsed ? 'chevron-right' : 'chevron-down'}
                    title={collapsed ? 'Expand section' : 'Collapse section'}
                    onClick={onToggleCollapsed}
                />
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <div className="section-actions">
                    {bulkActions.map((descriptor) => (
                        <IconButton
                            key={descriptor.action}
                            icon={descriptor.icon}
                            title={descriptor.title}
                            onClick={() => onBulkAction(descriptor.action)}
                        />
                    ))}
                    <span>{section.items.length}</span>
                </div>
            </header>
            <div id={`${section.id}-items`} className="change-list" hidden={collapsed}>
                {viewMode === ChangesViewMode.Tree
                    ? tree.map((node) => (
                        <TreeNodeView
                            key={node.id}
                            node={node}
                            selectedItemIds={selectedItemIds}
                            onSelectItem={onSelectItem}
                            onRowAction={onRowAction}
                        />
                    ))
                    : visible.items.map((item) => (
                        <ChangeRow
                            key={item.id}
                            item={item}
                            depth={0}
                            selected={selectedItemIds.has(item.id)}
                            onSelect={onSelectItem}
                            onAction={onRowAction}
                        />
                    ))}
                {visible.hasMore ? (
                    <button
                        type="button"
                        className="show-more-changes"
                        onClick={() => setVisibleLimit(visible.nextLimit)}
                    >
                        Show more
                    </button>
                ) : null}
            </div>
        </section>
    );
}
