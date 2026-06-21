import { useState } from 'react';
import type { StashEntry, StashFileEntry } from '@protocol/changes/types';
import { Codicon } from '@webview/shared/codicon';
import type { StashEntryAction } from '@webview/features/changes/stash-commands';
import { StashItem } from '@webview/features/changes/stash-item';

interface StashListProps {
    readonly stashes: readonly StashEntry[];
    readonly expandedIndexes: readonly number[];
    readonly filesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
    readonly onToggleStash: (index: number) => void;
    readonly onStashAction: (index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (index: number, file: StashFileEntry) => void;
    readonly title?: string;
    readonly showWhenEmpty?: boolean;
}

export function StashList({
    stashes,
    expandedIndexes,
    filesByIndex,
    onToggleStash,
    onStashAction,
    onStashFileDiff,
    title = 'Stashes',
    showWhenEmpty = false,
}: StashListProps) {
    const [panelCollapsed, setPanelCollapsed] = useState(false);

    if (stashes.length === 0 && !showWhenEmpty) { return null; }

    const togglePanel = () => setPanelCollapsed((collapsed) => !collapsed);

    return (
        <section className="stash-panel" aria-label="Stashes">
            <header
                className="stash-panel-header"
                role="button"
                tabIndex={0}
                aria-expanded={!panelCollapsed}
                onClick={togglePanel}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        togglePanel();
                    }
                }}
            >
                <button
                    type="button"
                    className="stash-toggle"
                    aria-hidden="true"
                    tabIndex={-1}
                    title={panelCollapsed ? 'Expand stashes' : 'Collapse stashes'}
                    onClick={(event) => { event.stopPropagation(); togglePanel(); }}
                >
                    <Codicon name={panelCollapsed ? 'chevron-right' : 'chevron-down'} />
                </button>
                <h2>{title}</h2>
                <span>{stashes.length}</span>
            </header>
            {!panelCollapsed ? (
                <div className="stash-list">
                    {stashes.map((stash) => (
                        <StashItem
                            key={stash.index}
                            stash={stash}
                            expanded={expandedIndexes.includes(stash.index)}
                            files={filesByIndex[stash.index]}
                            onToggle={onToggleStash}
                            onAction={onStashAction}
                            onFileDiff={onStashFileDiff}
                        />
                    ))}
                </div>
            ) : null}
        </section>
    );
}
