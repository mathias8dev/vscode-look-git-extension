import { useEffect, useRef } from 'react';
import type { BranchCommand } from '../../../protocol/graph/messages';

export interface BranchContextMenuState {
    readonly branch: string;
    readonly isRemote: boolean;
    readonly isCurrent: boolean;
    readonly currentBranch: string;
    readonly x: number;
    readonly y: number;
}

interface BranchContextMenuProps {
    readonly state: BranchContextMenuState;
    readonly onClose: () => void;
    readonly onCommand: (command: BranchCommand, branch: string, isRemote: boolean) => void;
}

type BranchMenuItem =
    | {
        readonly kind: 'command';
        readonly label: (state: BranchContextMenuState) => string;
        readonly command: BranchCommand;
        readonly icon?: string;
        readonly accelerator?: string;
        readonly disabled?: (state: BranchContextMenuState) => boolean;
    }
    | { readonly kind: 'separator' };

const MENU_ITEMS: readonly BranchMenuItem[] = [
    { kind: 'command', label: () => 'Checkout', command: 'checkout', icon: 'git-branch' },
    { kind: 'command', label: (state) => `New Branch from '${state.branch}'...`, command: 'newBranchFrom', icon: 'add' },
    { kind: 'command', label: (state) => `Checkout and Rebase onto '${state.currentBranch}'`, command: 'checkoutRebaseOnto', disabled: (state) => state.isCurrent },
    { kind: 'separator' },
    { kind: 'command', label: (state) => `Compare with '${state.currentBranch}'`, command: 'compareWithCurrent', icon: 'compare-changes', disabled: (state) => state.isCurrent },
    { kind: 'command', label: () => 'Show Diff with Working Tree', command: 'showDiffWithWorkingTree', icon: 'diff' },
    { kind: 'separator' },
    { kind: 'command', label: (state) => `Rebase '${state.currentBranch}' onto '${state.branch}'`, command: 'rebaseOnto', disabled: (state) => state.isCurrent },
    { kind: 'command', label: (state) => `Merge '${state.branch}' into '${state.currentBranch}'`, command: 'mergeInto', disabled: (state) => state.isCurrent },
    { kind: 'separator' },
    { kind: 'command', label: () => 'Push...', command: 'push', icon: 'cloud-upload', disabled: (state) => state.isRemote },
    { kind: 'separator' },
    { kind: 'command', label: () => 'Rename...', command: 'rename', accelerator: 'F2', disabled: (state) => state.isRemote },
    { kind: 'command', label: () => 'Delete', command: 'delete', icon: 'trash' },
];

export function BranchContextMenu({ state, onClose, onCommand }: BranchContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) { onClose(); }
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { onClose(); }
        };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="commit-context-menu branch-context-menu"
            style={{ left: state.x, top: state.y }}
            role="menu"
        >
            {MENU_ITEMS.map((item, index) => renderMenuItem(item, index, state, onClose, onCommand))}
        </div>
    );
}

function renderMenuItem(
    item: BranchMenuItem,
    index: number,
    state: BranchContextMenuState,
    onClose: () => void,
    onCommand: (command: BranchCommand, branch: string, isRemote: boolean) => void,
) {
    if (item.kind === 'separator') {
        return <div key={`separator-${index}`} className="commit-context-separator" role="separator" />;
    }

    const disabled = item.disabled?.(state) ?? false;
    const label = item.label(state);
    const activate = () => {
        if (disabled) { return; }
        onClose();
        onCommand(item.command, state.branch, state.isRemote);
    };

    return (
        <button
            key={label}
            type="button"
            className="commit-context-item"
            role="menuitem"
            disabled={disabled}
            onClick={activate}
        >
            <span className="commit-context-icon">
                {item.icon ? <i className={`codicon codicon-${item.icon}`} aria-hidden="true" /> : null}
            </span>
            <span className="commit-context-label">{label}</span>
            {item.accelerator ? <span className="commit-context-accelerator">{item.accelerator}</span> : null}
        </button>
    );
}
