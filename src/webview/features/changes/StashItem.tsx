import type { StashEntry, StashFileEntry } from '../../../protocol/changes/types';
import { vscodeApi } from '../../platform/vscodeHost';
import { messageForStashAction } from './stashCommands';
import { StashFileRow } from './StashFileRow';

interface StashItemProps {
    readonly stash: StashEntry;
    readonly expanded: boolean;
    readonly files: readonly StashFileEntry[] | undefined;
    readonly onToggle: (index: number) => void;
}

export function StashItem({ stash, expanded, files, onToggle }: StashItemProps) {
    return (
        <article className="stash-item">
            <header className="stash-item-header">
                <button
                    type="button"
                    className="stash-toggle"
                    aria-expanded={expanded}
                    onClick={() => onToggle(stash.index)}
                >
                    {expanded ? 'Hide' : 'Files'}
                </button>
                <div className="stash-title">
                    <strong>stash@{'{'}{stash.index}{'}'}</strong>
                    <span>{stash.message}</span>
                </div>
                <div className="stash-actions">
                    <button type="button" onClick={() => vscodeApi.postMessage(messageForStashAction(stash.index, 'apply'))}>
                        Apply
                    </button>
                    <button type="button" onClick={() => vscodeApi.postMessage(messageForStashAction(stash.index, 'pop'))}>
                        Pop
                    </button>
                    <button type="button" onClick={() => vscodeApi.postMessage(messageForStashAction(stash.index, 'drop'))}>
                        Drop
                    </button>
                </div>
            </header>
            {expanded ? <div className="stash-files">{stashFilesContent(stash.index, files)}</div> : null}
        </article>
    );
}

function stashFilesContent(index: number, files: readonly StashFileEntry[] | undefined) {
    if (!files) { return <p className="stash-placeholder">Loading stash files</p>; }
    if (files.length === 0) { return <p className="stash-placeholder">No files in this stash</p>; }
    return files.map((file) => (
        <StashFileRow key={`${index}:${file.status}:${file.filePath}:${file.origPath ?? ''}`} index={index} file={file} />
    ));
}
