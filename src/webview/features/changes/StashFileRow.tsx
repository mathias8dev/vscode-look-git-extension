import type { StashFileEntry } from '../../../protocol/changes/types';
import { IconButton } from '../../shared/IconButton';
import { changesItemContext } from './context-menu-model';
import { FileTypeIcon } from './FileTypeIcon';
import { iconKindForStashFile } from './fileIconModel';

interface StashFileRowProps {
    readonly index: number;
    readonly file: StashFileEntry;
    readonly onDiff: (index: number, file: StashFileEntry) => void;
}

export function StashFileRow({ index, file, onDiff }: StashFileRowProps) {
    const openDiff = () => onDiff(index, file);
    return (
        <div
            className="stash-file-row"
            data-vscode-context={changesItemContext()}
            title={file.filePath}
            tabIndex={0}
            onClick={openDiff}
            onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') { return; }
                event.preventDefault();
                openDiff();
            }}
        >
            <FileTypeIcon kind={iconKindForStashFile(file)} />
            <div className="file-info">
                <span className="file-name">{fileName(file.filePath)}</span>
                <span className="file-path">{parentPath(file)}</span>
            </div>
            <div className="row-actions">
                <IconButton
                    icon="diff"
                    title="Open stash diff"
                    onClick={(event) => {
                        event.stopPropagation();
                        openDiff();
                    }}
                />
            </div>
            <span className={`status-letter status-letter-${statusLetterKind(file.status)}`} aria-hidden="true">
                {statusLetter(file.status)}
            </span>
        </div>
    );
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}

function parentPath(file: StashFileEntry): string {
    const parts = file.filePath.split('/');
    parts.pop();
    const parent = parts.join('/');
    if (file.origPath) { return `${file.origPath} → ${parent || '.'}`; }
    return parent;
}

function statusLetter(status: string): string {
    if (status.includes('A') || status.includes('?')) { return 'A'; }
    if (status.includes('D')) { return 'D'; }
    if (status.includes('R')) { return 'R'; }
    if (status.includes('U')) { return 'C'; }
    return 'M';
}

function statusLetterKind(status: string): string {
    if (status.includes('A') || status.includes('?')) { return 'added'; }
    if (status.includes('D')) { return 'deleted'; }
    if (status.includes('R')) { return 'renamed'; }
    if (status.includes('U')) { return 'conflict'; }
    return 'modified';
}
