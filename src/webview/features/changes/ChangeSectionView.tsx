import { useEffect, useRef, useState } from 'react';
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
    readonly onStash?: (message: string) => void;
    readonly showWhenEmpty?: boolean;
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
    onStash,
    showWhenEmpty = false,
}: ChangeSectionViewProps) {
    const [visibleLimit, setVisibleLimit] = useState(CHANGE_SECTION_PAGE_SIZE);
    const [showStashPrompt, setShowStashPrompt] = useState(false);
    const [stashMsg, setStashMsg] = useState('');
    const stashInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (showStashPrompt) {
            stashInputRef.current?.focus();
        }
    }, [showStashPrompt]);

    if (section.items.length === 0 && !showWhenEmpty) { return null; }

    const visible = visibleChangeItems(section.items, visibleLimit);
    const tree = buildChangeTree(visible.items);
    const bulkActions = bulkActionsFor(section);

    const confirmStash = () => {
        onStash?.(stashMsg);
        setStashMsg('');
        setShowStashPrompt(false);
    };

    const cancelStash = () => {
        setStashMsg('');
        setShowStashPrompt(false);
    };

    return (
        <section className="change-section" aria-labelledby={`${section.id}-title`}>
            <header
                className="change-section-header"
                onClick={onToggleCollapsed}
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleCollapsed(); } }}
            >
                <button
                    type="button"
                    className="section-toggle"
                    title={collapsed ? 'Expand section' : 'Collapse section'}
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={(e) => e.stopPropagation()}
                >
                    <i className={`codicon codicon-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden="true" />
                </button>
                <h2 id={`${section.id}-title`}>{section.title}</h2>
                <div className="section-actions" onClick={(e) => e.stopPropagation()}>
                    {bulkActions.map((descriptor) => (
                        <IconButton
                            key={descriptor.action}
                            icon={descriptor.icon}
                            title={descriptor.title}
                            onClick={() => onBulkAction(descriptor.action)}
                        />
                    ))}
                    {onStash ? (
                        <IconButton
                            icon="archive"
                            title="Stash all changes"
                            onClick={() => setShowStashPrompt(!showStashPrompt)}
                        />
                    ) : null}
                    <span>{section.items.length}</span>
                </div>
            </header>
            {onStash && showStashPrompt ? (
                <div className="stash-prompt" role="group" aria-label="Create stash">
                    <input
                        ref={stashInputRef}
                        type="text"
                        value={stashMsg}
                        placeholder="Stash message (optional)"
                        aria-label="Stash message"
                        onChange={(e) => setStashMsg(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); confirmStash(); }
                            if (e.key === 'Escape') { e.preventDefault(); cancelStash(); }
                        }}
                    />
                    <IconButton icon="check" title="Stash" onClick={confirmStash} />
                    <IconButton icon="close" title="Cancel" onClick={cancelStash} />
                </div>
            ) : null}
            {!collapsed && (
                <div id={`${section.id}-items`} className="change-list">
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
            )}
        </section>
    );
}
