import type { StashFileEntry } from '../../../protocol/changes/types';
import { IconButton } from '../../shared/IconButton';
import { FileTypeIcon } from './FileTypeIcon';
import { iconKindForStashFile } from './fileIconModel';

interface StashFileRowProps {
    readonly index: number;
    readonly file: StashFileEntry;
    readonly onDiff: (index: number, file: StashFileEntry) => void;
}

export function StashFileRow({ index, file, onDiff }: StashFileRowProps) {
    return (
        <div className="stash-file-row" title={file.filePath}>
            <FileTypeIcon kind={iconKindForStashFile(file)} />
            <div className="file-info">
                <span className="file-name">{fileName(file.filePath)}</span>
                <span className="file-path">{parentPath(file)}</span>
            </div>
            <div className="row-actions">
                <IconButton
                    icon="diff"
                    title="Open stash diff"
                    onClick={() => onDiff(index, file)}
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
