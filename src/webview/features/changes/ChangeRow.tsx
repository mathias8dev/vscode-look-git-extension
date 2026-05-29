import type { MouseEvent } from 'react';
import type { StatusEntry } from '../../../protocol/changes/types';
import { rowActionsFor, type ChangeRowAction } from './changeCommands';
import { statusLabel, type ChangeListItem } from './changeTree';
import type { ChangeSelectionMode } from './changesState';
import { FileTypeIcon } from './FileTypeIcon';
import { iconKindForStatusEntry } from './fileIconModel';
import { depthStyle } from './viewStyles';

interface ChangeRowProps {
    readonly item: ChangeListItem;
    readonly depth: number;
    readonly selected: boolean;
    readonly onSelect: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onAction: (item: ChangeListItem, action: ChangeRowAction) => void;
}

export function ChangeRow({ item, depth, selected, onSelect, onAction }: ChangeRowProps) {
    const entry = item.entry;
    const actions = rowActionsFor(item);
    return (
        <article
            className="change-row"
            style={depthStyle(depth)}
            title={entry.filePath}
            aria-selected={selected}
            tabIndex={0}
            onClick={(event) => onSelect(item, selectionModeFromEvent(event))}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(item, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace');
                }
            }}
        >
            <span className={`status-dot status-${statusKind(entry)}`} aria-hidden="true" />
            <FileTypeIcon kind={iconKindForStatusEntry(entry)} />
            <span className="status-code">{statusCode(entry)}</span>
            <span className="file-main">{fileName(entry.filePath)}</span>
            <span className="file-path">{parentPath(entry)}</span>
            <span className="status-label">{statusLabel(entry)}</span>
            <div className="row-actions" aria-label={`Actions for ${entry.filePath}`}>
                {actions.map((descriptor) => (
                    <button
                        key={descriptor.action}
                        type="button"
                        title={descriptor.title}
                        onClick={(event) => {
                            event.stopPropagation();
                            onAction(item, descriptor.action);
                        }}
                    >
                        {descriptor.label}
                    </button>
                ))}
            </div>
        </article>
    );
}

function selectionModeFromEvent(event: MouseEvent<HTMLElement>): ChangeSelectionMode {
    if (event.shiftKey) { return 'range'; }
    if (event.ctrlKey || event.metaKey) { return 'toggle'; }
    return 'replace';
}

function fileName(filePath: string): string {
    return filePath.split('/').pop() || filePath;
}

function parentPath(entry: StatusEntry): string {
    const parts = entry.filePath.split('/');
    parts.pop();
    const parent = parts.join('/');
    if (entry.origPath) { return `${entry.origPath} -> ${parent || '.'}`; }
    return parent;
}

function statusCode(entry: StatusEntry): string {
    const code = `${entry.indexStatus}${entry.workTreeStatus}`.trim();
    return code || entry.indexStatus || entry.workTreeStatus || '?';
}

function statusKind(entry: StatusEntry): string {
    const code = `${entry.indexStatus}${entry.workTreeStatus}`;
    if (code.includes('U')) { return 'conflict'; }
    if (code.includes('D')) { return 'deleted'; }
    if (code.includes('A') || code.includes('?')) { return 'added'; }
    return 'modified';
}
