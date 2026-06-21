import { selectionActionsFor, type ChangeSelectionAction } from '@webview/features/changes/selectionCommands';
import type { ChangeListItem } from '@webview/features/changes/changeTree';

interface SelectionToolbarProps {
    readonly selectedItems: readonly ChangeListItem[];
    readonly onAction: (action: ChangeSelectionAction) => void;
    readonly onClear: () => void;
}

export function SelectionToolbar({ selectedItems, onAction, onClear }: SelectionToolbarProps) {
    if (selectedItems.length === 0) { return null; }
    const actions = selectionActionsFor(selectedItems);
    return (
        <section className="selection-toolbar" aria-label="Selected changes actions">
            <span>{selectionText(selectedItems.length)}</span>
            <div className="selection-actions">
                {actions.map((descriptor) => (
                    <button
                        key={descriptor.action}
                        type="button"
                        title={descriptor.title}
                        onClick={() => onAction(descriptor.action)}
                    >
                        {descriptor.label}
                    </button>
                ))}
                <button type="button" title="Clear selection" onClick={onClear}>Clear</button>
            </div>
        </section>
    );
}

function selectionText(count: number): string {
    return count === 1 ? '1 selected' : `${count} selected`;
}
