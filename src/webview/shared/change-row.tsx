import { useState } from 'react';
import type { StatusEntry } from '@protocol/changes/types';
import type { ChangeActionDescriptor } from '@webview/shared/change-row-actions';
import { FileTypeIcon } from '@webview/shared/file-type-icon';
import { iconKindForPath } from '@webview/shared/file-icon-model';
import { IconButton } from '@webview/shared/icon-button';
import { depthStyle } from '@webview/shared/view-styles';

export type ChangeRowSelectionMode = 'replace' | 'toggle' | 'range';

export interface SharedChangeRowItem {
    readonly id: string;
    readonly entry: StatusEntry;
}

interface SharedChangeRowProps<TItem extends SharedChangeRowItem, TAction extends string> {
    readonly item: TItem;
    readonly depth: number;
    readonly selected: boolean;
    readonly context: string;
    readonly actions: readonly ChangeActionDescriptor<TAction>[];
    readonly primaryAction?: TAction;
    readonly alwaysShowActions?: boolean;
    readonly onSelect: (item: TItem, mode: ChangeRowSelectionMode) => void;
    readonly onOpenContextMenu: (item: TItem) => void;
    readonly onAction: (item: TItem, action: TAction) => void;
}

export function SharedChangeRow<TItem extends SharedChangeRowItem, TAction extends string>({
    item,
    depth,
    selected,
    context,
    actions,
    primaryAction,
    alwaysShowActions = false,
    onSelect,
    onOpenContextMenu,
    onAction,
}: SharedChangeRowProps<TItem, TAction>) {
    const entry = item.entry;
    const [active, setActive] = useState(false);
    const showActions = (alwaysShowActions || active || selected) && actions.length > 0;
    return (
        <article
            className="change-row"
            data-vscode-context={context}
            style={depthStyle(depth)}
            title={entry.filePath}
            aria-selected={selected}
            tabIndex={0}
            data-change-item-id={item.id}
            onMouseEnter={() => setActive(true)}
            onMouseLeave={() => setActive(false)}
            onFocus={() => setActive(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setActive(false);
                }
            }}
            onContextMenu={() => onOpenContextMenu(item)}
            onClick={(event) => {
                if (event.shiftKey) {
                    onSelect(item, 'range');
                } else if (event.ctrlKey || event.metaKey) {
                    onSelect(item, 'toggle');
                } else {
                    onSelect(item, 'replace');
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
                    onSelect(item, 'replace');
                    if (primaryAction) { onAction(item, primaryAction); }
                    return;
                }
                if (event.key === ' ') {
                    event.preventDefault();
                    onSelect(item, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace');
                    return;
                }
                if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                    event.preventDefault();
                    if (!selected) { onSelect(item, 'replace'); }
                    openKeyboardContextMenu(event.currentTarget);
                }
            }}
        >
            <FileTypeIcon kind={entry.isSubmodule ? 'submodule' : iconKindForPath(entry.filePath)} />
            <div className="file-info">
                <span className="file-name">{fileName(entry.filePath)}</span>
                <span className="file-path">{parentPath(entry)}</span>
            </div>
            {showActions ? (
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
            ) : null}
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
    if (entry.origPath) { return `${entry.origPath} -> ${parent || '.'}`; }
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
