import type { StatusEntry } from '../../../protocol/changes/types';
import { IconButton } from '../../shared/IconButton';
import { ChangeRowAction, primaryRowActionFor, rowActionsFor, type ChangeActionDescriptor } from './changeCommands';
import type { ChangeListItem } from './changeTree';
import { ChangeSelectionMode } from './changesState';
import { FileTypeIcon } from './FileTypeIcon';
import { iconKindForStatusEntry } from './fileIconModel';
import { depthStyle } from './viewStyles';

interface ChangeRowProps {
    readonly item: ChangeListItem;
    readonly depth: number;
    readonly selected: boolean;
    readonly context: string;
    readonly onSelect: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onOpenContextMenu: (item: ChangeListItem) => void;
    readonly onAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly actions?: readonly ChangeActionDescriptor<ChangeRowAction>[];
}

export function ChangeRow({ item, depth, selected, context, onSelect, onOpenContextMenu, onAction, actions: actionOverride }: ChangeRowProps) {
    const entry = item.entry;
    const actions = actionOverride ?? rowActionsFor(item);
    const primaryAction = primaryRowActionFor(item);
    return (
        <article
            className="change-row"
            data-vscode-context={context}
            style={depthStyle(depth)}
            title={entry.filePath}
            aria-selected={selected}
            tabIndex={0}
            data-change-item-id={item.id}
            onContextMenu={() => onOpenContextMenu(item)}
            onClick={(event) => {
                if (event.shiftKey) {
                    onSelect(item, ChangeSelectionMode.Range);
                } else if (event.ctrlKey || event.metaKey) {
                    onSelect(item, ChangeSelectionMode.Toggle);
                } else {
                    onSelect(item, ChangeSelectionMode.Replace);
                    if (primaryAction) { onAction(item, primaryAction); }
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const rows = Array.from(
                        document.querySelectorAll<HTMLElement>('article.change-row[tabindex="0"]'),
                    );
                    const idx = rows.indexOf(event.currentTarget);
                    const next = event.key === 'ArrowDown' ? rows[idx + 1] : rows[idx - 1];
                    next?.focus();
                    if (event.shiftKey && next) {
                        next.dispatchEvent(new KeyboardEvent('keydown', {
                            key: ' ',
                            shiftKey: true,
                            bubbles: true,
                            cancelable: true,
                        }));
                    }
                    return;
                }
                if (event.key === 'Enter') {
                    event.preventDefault();
                    onSelect(item, ChangeSelectionMode.Replace);
                    if (primaryAction) { onAction(item, primaryAction); }
                    return;
                }
                if (event.key === ' ') {
                    event.preventDefault();
                    onSelect(item, event.shiftKey ? ChangeSelectionMode.Range : event.ctrlKey || event.metaKey ? ChangeSelectionMode.Toggle : ChangeSelectionMode.Replace);
                    return;
                }
                if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                    event.preventDefault();
                    if (!selected) { onSelect(item, ChangeSelectionMode.Replace); }
                    openKeyboardContextMenu(event.currentTarget);
                }
            }}
        >
            <FileTypeIcon kind={iconKindForStatusEntry(entry)} />
            <div className="file-info">
                <span className="file-name">{fileName(entry.filePath)}</span>
                <span className="file-path">{parentPath(entry)}</span>
            </div>
            <div className="row-actions" aria-label={`Actions for ${entry.filePath}`}>
                {actions.map((descriptor) => (
                    <IconButton
                        key={descriptor.action}
                        icon={descriptor.icon}
                        title={descriptor.title}
                        onClick={(event) => {
                            event.stopPropagation();
                            onAction(item, descriptor.action);
                        }}
                    />
                ))}
            </div>
            <span
                className={`status-letter status-letter-${statusLetterKind(entry)}`}
                aria-hidden="true"
            >
                {statusDisplayLetter(entry)}
            </span>
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
    if (entry.origPath) { return `${entry.origPath} → ${parent || '.'}`; }
    return parent;
}

function statusDisplayLetter(entry: StatusEntry): string {
    const idx = entry.indexStatus;
    const wt = entry.workTreeStatus;
    if (idx === '?' || wt === '?') { return 'U'; }
    if (idx === 'U' || wt === 'U') { return 'C'; }
    if (idx === 'A' && wt === 'A') { return 'C'; }
    if (idx === 'D' && wt === 'D') { return 'C'; }
    const status = idx.trim() || wt.trim();
    if (status === 'R') { return 'R'; }
    if (status === 'D') { return 'D'; }
    if (status === 'A') { return 'A'; }
    return 'M';
}

function statusLetterKind(entry: StatusEntry): string {
    const letter = statusDisplayLetter(entry);
    if (letter === 'U') { return 'untracked'; }
    if (letter === 'A') { return 'added'; }
    if (letter === 'D') { return 'deleted'; }
    if (letter === 'C') { return 'conflict'; }
    if (letter === 'R') { return 'renamed'; }
    return 'modified';
}

function openKeyboardContextMenu(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 12,
        clientY: rect.top + 12,
    }));
}
