import { ChangeRowAction, primaryRowActionFor, rowActionsFor, type ChangeActionDescriptor } from '@webview/features/changes/change-commands';
import type { ChangeListItem } from '@webview/features/changes/change-tree';
import { ChangeSelectionMode } from '@webview/features/changes/changes-state';
import { SharedChangeRow, type ChangeRowSelectionMode } from '@webview/shared/change-row';

interface ChangeRowProps {
    readonly item: ChangeListItem;
    readonly depth: number;
    readonly selected: boolean;
    readonly context: string;
    readonly onSelect: (item: ChangeListItem, mode: ChangeSelectionMode) => void;
    readonly onOpenContextMenu: (item: ChangeListItem) => void;
    readonly onAction: (item: ChangeListItem, action: ChangeRowAction) => void;
    readonly actions?: readonly ChangeActionDescriptor<ChangeRowAction>[];
    readonly primaryAction?: ChangeRowAction;
    readonly alwaysShowActions?: boolean;
}

export function ChangeRow({
    item,
    depth,
    selected,
    context,
    onSelect,
    onOpenContextMenu,
    onAction,
    actions: actionOverride,
    primaryAction: primaryActionOverride,
    alwaysShowActions = false,
}: ChangeRowProps) {
    return (
        <SharedChangeRow
            item={item}
            depth={depth}
            selected={selected}
            context={context}
            actions={actionOverride ?? rowActionsFor(item)}
            primaryAction={primaryActionOverride ?? primaryRowActionFor(item)}
            alwaysShowActions={alwaysShowActions}
            onSelect={(selectedItem, mode) => onSelect(selectedItem, toChangeSelectionMode(mode))}
            onOpenContextMenu={onOpenContextMenu}
            onAction={onAction}
        />
    );
}

function toChangeSelectionMode(mode: ChangeRowSelectionMode): ChangeSelectionMode {
    switch (mode) {
        case 'range':
            return ChangeSelectionMode.Range;
        case 'toggle':
            return ChangeSelectionMode.Toggle;
        case 'replace':
            return ChangeSelectionMode.Replace;
    }
}
