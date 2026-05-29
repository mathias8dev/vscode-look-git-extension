import { useState } from 'react';
import type { StashEntry, StashFileEntry } from '../../../protocol/changes/types';
import type { CreateStashKind, StashEntryAction } from './stashCommands';
import { StashItem } from './StashItem';

interface StashListProps {
    readonly stashes: readonly StashEntry[];
    readonly changeCount: number;
    readonly stagedCount: number;
    readonly expandedIndexes: readonly number[];
    readonly filesByIndex: Readonly<Record<number, readonly StashFileEntry[]>>;
    readonly onToggleStash: (index: number) => void;
    readonly onCreateStash: (kind: CreateStashKind, message: string) => void;
    readonly onStashAction: (index: number, action: StashEntryAction) => void;
    readonly onStashFileDiff: (index: number, file: StashFileEntry) => void;
}

export function StashList({
    stashes,
    changeCount,
    stagedCount,
    expandedIndexes,
    filesByIndex,
    onToggleStash,
    onCreateStash,
    onStashAction,
    onStashFileDiff,
}: StashListProps) {
    const [message, setMessage] = useState('');
    const canStashAll = changeCount > 0;
    const canStashStaged = stagedCount > 0;

    const createStash = (kind: CreateStashKind) => {
        if ((kind === 'staged' && !canStashStaged) || (kind === 'all' && !canStashAll)) { return; }
        onCreateStash(kind, message);
        setMessage('');
    };

    return (
        <section className="stash-panel" aria-label="Stashes">
            <header className="stash-panel-header">
                <h2>Stashes</h2>
                <span>{stashes.length}</span>
            </header>
            <div className="stash-create">
                <input
                    type="text"
                    value={message}
                    placeholder="Stash message"
                    onChange={(event) => setMessage(event.currentTarget.value)}
                />
                <div className="stash-create-actions">
                    <button type="button" disabled={!canStashAll} onClick={() => createStash('all')}>Stash</button>
                    <button type="button" disabled={!canStashStaged} onClick={() => createStash('staged')}>Stash Staged</button>
                </div>
            </div>
            <div className="stash-list">
                {stashes.length === 0 ? <p className="stash-placeholder">No stashes</p> : stashes.map((stash) => (
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
        </section>
    );
}
