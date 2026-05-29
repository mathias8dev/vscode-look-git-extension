import type { StatusEntry } from '../../../protocol/changes/types';
import { rowActionsFor, type ChangeRowAction } from './changeCommands';
import { statusLabel, type ChangeListItem } from './changeTree';
import { depthStyle } from './viewStyles';

interface ChangeRowProps {
    readonly item: ChangeListItem;
    readonly depth: number;
    readonly onAction: (item: ChangeListItem, action: ChangeRowAction) => void;
}

export function ChangeRow({ item, depth, onAction }: ChangeRowProps) {
    const entry = item.entry;
    const actions = rowActionsFor(item);
    return (
        <article className="change-row" style={depthStyle(depth)} title={entry.filePath}>
            <span className={`status-dot status-${statusKind(entry)}`} aria-hidden="true" />
            <span className="file-main">{fileName(entry.filePath)}</span>
            <span className="file-path">{parentPath(entry)}</span>
            <span className="status-label">{statusLabel(entry)}</span>
            <div className="row-actions" aria-label={`Actions for ${entry.filePath}`}>
                {actions.map((descriptor) => (
                    <button
                        key={descriptor.action}
                        type="button"
                        title={descriptor.title}
                        onClick={() => onAction(item, descriptor.action)}
                    >
                        {descriptor.label}
                    </button>
                ))}
            </div>
        </article>
    );
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

function statusKind(entry: StatusEntry): string {
    const code = `${entry.indexStatus}${entry.workTreeStatus}`;
    if (code.includes('U')) { return 'conflict'; }
    if (code.includes('D')) { return 'deleted'; }
    if (code.includes('A') || code.includes('?')) { return 'added'; }
    return 'modified';
}
