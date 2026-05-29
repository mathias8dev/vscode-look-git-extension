import { bulkActionsFor, type ChangeBulkAction, type ChangeRowAction } from './changeCommands';
import { buildChangeTree, type ChangeListItem, type ChangeSection } from './changeTree';
import type { ChangeSelectionMode, ChangesViewMode } from './changesState';
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
    if (section.items.length === 0) { return null; }
    const tree = buildChangeTree(section.items);
    const bulkActions = bulkActionsFor(section);
    return (
        <section className="change-section" aria-labelledby={`${section.id}-title`}>
            <header className="change-section-header">
                <button
                    type="button"
                    className="section-toggle"
                    aria-expanded={!collapsed}
                    aria-controls={`${section.id}-items`}
                    onClick={onToggleCollapsed}
                >
                    {collapsed ? '>' : 'v'}
                </button>
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <div className="section-actions">
                    {bulkActions.map((descriptor) => (
                        <button
                            key={descriptor.action}
                            type="button"
                            title={descriptor.title}
                            onClick={() => onBulkAction(descriptor.action)}
                        >
                            {descriptor.label}
                        </button>
                    ))}
                    <span>{section.items.length}</span>
                </div>
            </header>
            <div id={`${section.id}-items`} className="change-list" hidden={collapsed}>
                {viewMode === 'tree'
                    ? tree.map((node) => (
                        <TreeNodeView
                            key={node.id}
                            node={node}
                            selectedItemIds={selectedItemIds}
                            onSelectItem={onSelectItem}
                            onRowAction={onRowAction}
                        />
                    ))
                    : section.items.map((item) => (
                        <ChangeRow
                            key={item.id}
                            item={item}
                            depth={0}
                            selected={selectedItemIds.has(item.id)}
                            onSelect={onSelectItem}
                            onAction={onRowAction}
                        />
                    ))}
            </div>
        </section>
    );
}
