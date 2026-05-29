import type { StashEntry, StashFileEntry } from '../../../protocol/changes/types';
import { Codicon } from '../../shared/Codicon';
import { StashEntryAction } from './stashCommands';
import { StashFileRow } from './StashFileRow';

interface StashItemProps {
    readonly stash: StashEntry;
    readonly expanded: boolean;
    readonly files: readonly StashFileEntry[] | undefined;
    readonly onToggle: (index: number) => void;
    readonly onAction: (index: number, action: StashEntryAction) => void;
    readonly onFileDiff: (index: number, file: StashFileEntry) => void;
}

export function StashItem({ stash, expanded, files, onToggle, onAction, onFileDiff }: StashItemProps) {
    return (
        <article className="stash-item">
            <header className="stash-item-header">
                <button
                    type="button"
                    className="stash-toggle"
                    title={expanded ? 'Hide files' : 'Show files'}
                    aria-label={expanded ? 'Hide files' : 'Show files'}
                    aria-expanded={expanded}
                    onClick={() => onToggle(stash.index)}
                >
                    <Codicon name={expanded ? 'chevron-down' : 'chevron-right'} />
                </button>
                <div className="stash-title">
                    <strong>stash@{'{'}{stash.index}{'}'}</strong>
                    <span>{stash.message}</span>
                </div>
                <div className="stash-actions">
                    <button type="button" onClick={() => onAction(stash.index, StashEntryAction.Apply)}>
                        Apply
                    </button>
                    <button type="button" onClick={() => onAction(stash.index, StashEntryAction.Pop)}>
                        Pop
                    </button>
                    <button type="button" onClick={() => onAction(stash.index, StashEntryAction.Drop)}>
                        Drop
                    </button>
                </div>
            </header>
            {expanded ? <div className="stash-files">{stashFilesContent(stash.index, files, onFileDiff)}</div> : null}
        </article>
    );
}

function stashFilesContent(
    index: number,
    files: readonly StashFileEntry[] | undefined,
    onFileDiff: (index: number, file: StashFileEntry) => void,
) {
    if (!files) { return <p className="stash-placeholder">Loading stash files</p>; }
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
