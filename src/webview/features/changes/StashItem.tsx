import type { StashEntry, StashFileEntry } from '@protocol/changes/types';
import { Codicon } from '@webview/shared/Codicon';
import { IconButton } from '@webview/shared/IconButton';
import { changesItemContext } from '@webview/features/changes/context-menu-model';
import { StashEntryAction } from '@webview/features/changes/stashCommands';
import { StashFileRow } from '@webview/features/changes/StashFileRow';

interface StashItemProps {
    readonly stash: StashEntry;
    readonly expanded: boolean;
    readonly files: readonly StashFileEntry[] | undefined;
    readonly onToggle: (index: number) => void;
    readonly onAction: (index: number, action: StashEntryAction) => void;
    readonly onFileDiff: (index: number, file: StashFileEntry) => void;
}

export function StashItem({ stash, expanded, files, onToggle, onAction, onFileDiff }: StashItemProps) {
    const displayMessage = stash.message || `stash@{${stash.index}}`;
    return (
        <article className="stash-item" data-vscode-context={changesItemContext()}>
            <header
                className="stash-item-header"
                onClick={() => onToggle(stash.index)}
            >
                <button
                    type="button"
                    className="stash-toggle"
                    title={expanded ? 'Hide files' : 'Show files'}
                    aria-label={expanded ? 'Hide files' : 'Show files'}
                    aria-expanded={expanded}
                    onClick={(e) => { e.stopPropagation(); onToggle(stash.index); }}
                >
                    <Codicon name={expanded ? 'chevron-down' : 'chevron-right'} />
                </button>
                <div className="stash-title">
                    <span className="stash-title-message" title={displayMessage}>{displayMessage}</span>
                    <span className="stash-title-ref">stash@{'{'}{'{'}{stash.index}{'}'}</span>
                </div>
                <div className="stash-actions">
                    <IconButton
                        icon="git-stash-apply"
                        title="Apply stash (keep in list)"
                        onClick={(e) => { e.stopPropagation(); onAction(stash.index, StashEntryAction.Apply); }}
                    />
                    <IconButton
                        icon="unarchive"
                        title="Pop stash (apply and remove)"
                        onClick={(e) => { e.stopPropagation(); onAction(stash.index, StashEntryAction.Pop); }}
                    />
                    <IconButton
                        icon="trash"
                        title="Drop stash"
                        onClick={(e) => { e.stopPropagation(); onAction(stash.index, StashEntryAction.Drop); }}
                    />
                </div>
            </header>
            {expanded ? (
                <div className="stash-files">
                    {stashFilesContent(stash.index, files, onFileDiff)}
                </div>
            ) : null}
        </article>
    );
}

function stashFilesContent(
    index: number,
    files: readonly StashFileEntry[] | undefined,
    onFileDiff: (index: number, file: StashFileEntry) => void,
) {
    if (!files) { return <p className="stash-placeholder"><i className="codicon codicon-loading codicon-modifier-spin" aria-hidden="true" /> Loading…</p>; }
    if (files.length === 0) { return <p className="stash-placeholder">No files in this stash</p>; }
    return files.map((file) => (
        <StashFileRow
            key={`${index}:${file.status}:${file.filePath}:${file.origPath ?? ''}`}
            index={index}
            file={file}
            onDiff={onFileDiff}
        />
    ));
}
