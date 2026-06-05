import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../../shared/IconButton';
import { bulkActionsFor, type ChangeBulkAction, type ChangeRowAction } from './changeCommands';
import { buildChangeTree, type ChangeListItem, type ChangeSection } from './changeTree';
import { ChangesViewMode, type ChangeSelectionMode, type ChangesSortMode } from './changesState';
import { CHANGE_SECTION_PAGE_SIZE, visibleChangeItems } from './changePagination';
import { ChangeRow } from './ChangeRow';
import { compareChangeItems } from './changeViewModel';
import { TreeNodeView } from './TreeNodeView';

interface ChangeSectionViewProps {
    readonly section: ChangeSection;
    readonly viewMode: ChangesViewMode;
    readonly sortMode: ChangesSortMode;
    readonly collapsed: boolean;
    readonly selectedItemIds: ReadonlySet<string>;
    readonly contextForItem: (item: ChangeListItem) => string;
    readonly onToggleCollapsed: () => void;
    readonly onSelectItem: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onOpenSelectionContext: (item: ChangeListItem) => void;
    readonly onRowAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly onBulkAction: (action: ChangeBulkAction) => void;
    readonly onReview?: (section: ChangeSection) => void;
    readonly onStash?: (message: string) => void;
    readonly stashTitle?: string;
    readonly showWhenEmpty?: boolean;
}

export function ChangeSectionView({
    section,
    viewMode,
    sortMode,
    collapsed,
    selectedItemIds,
    contextForItem,
    onToggleCollapsed,
    onSelectItem,
    onOpenSelectionContext,
    onRowAction,
    onBulkAction,
    onReview,
    onStash,
    stashTitle = 'Stash changes',
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
    const tree = buildChangeTree(visible.items, (left, right) => compareChangeItems(left, right, sortMode));
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
                    onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
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
                    {onReview ? (
                        <IconButton
                            icon="comment-discussion"
                            title={reviewTitleFor(section.title)}
                            onClick={() => onReview(section)}
                        />
                    ) : null}
                    {onStash ? (
                        <IconButton
                            icon="git-stash"
                            title={stashTitle}
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
                                contextForItem={contextForItem}
                                onSelectItem={onSelectItem}
                                onOpenSelectionContext={onOpenSelectionContext}
                                onRowAction={onRowAction}
                            />
                        ))
                        : visible.items.map((item) => (
                            <ChangeRow
                                key={item.id}
                                item={item}
                                depth={0}
                                selected={selectedItemIds.has(item.id)}
                                context={contextForItem(item)}
                                onSelect={onSelectItem}
                                onOpenContextMenu={onOpenSelectionContext}
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

function reviewTitleFor(title: string): string {
    if (title === 'Changes') { return 'Review changes'; }
    if (title === 'Staged') { return 'Review staged changes'; }
    if (title === 'Conflicts') { return 'Review conflicts'; }
    return `Review ${title.toLowerCase()}`;
}
