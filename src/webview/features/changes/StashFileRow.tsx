import { useState } from 'react';
import type { StashFileEntry } from '@protocol/changes/types';
import { IconButton } from '@webview/shared/IconButton';
import { changesItemContext } from '@webview/features/changes/context-menu-model';
import { FileTypeIcon } from '@webview/features/changes/FileTypeIcon';
import { iconKindForStashFile } from '@webview/features/changes/fileIconModel';

interface StashFileRowProps {
    readonly index: number;
    readonly file: StashFileEntry;
    readonly onDiff: (index: number, file: StashFileEntry) => void;
}

export function StashFileRow({ index, file, onDiff }: StashFileRowProps) {
    const openDiff = () => onDiff(index, file);
    const [active, setActive] = useState(false);
    return (
        <div
            className="stash-file-row"
            data-vscode-context={changesItemContext()}
            title={file.filePath}
            tabIndex={0}
            onClick={openDiff}
            onMouseEnter={() => setActive(true)}
            onMouseLeave={() => setActive(false)}
            onFocus={() => setActive(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setActive(false);
                }
            }}
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
            {active ? (
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
            ) : null}
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
