import type { StashFileEntry } from '../../../protocol/changes/types';
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
            <span className={`status-dot status-${statusKind(file.status)}`} aria-hidden="true" />
            <FileTypeIcon kind={iconKindForStashFile(file)} />
            <span className="file-main">{fileName(file.filePath)}</span>
            <span className="file-path">{parentPath(file)}</span>
            <span className="status-label">{file.status}</span>
            <button
                type="button"
                title={`Open stash diff for ${file.filePath}`}
                onClick={() => onDiff(index, file)}
            >
                Diff
            </button>
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
    if (file.origPath) { return `${file.origPath} -> ${parent || '.'}`; }
    return parent;
}

function statusKind(status: string): string {
    if (status.includes('U')) { return 'conflict'; }
    if (status.includes('D')) { return 'deleted'; }
    if (status.includes('A') || status.includes('?')) { return 'added'; }
    return 'modified';
}
