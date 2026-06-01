import { useEffect, useRef } from 'react';
import type { CommitCommand } from '../../../protocol/graph/messages';

export interface CommitContextMenuState {
    readonly hash: string;
    readonly hashes: readonly string[];
    readonly x: number;
    readonly y: number;
    readonly canGoToChild: boolean;
    readonly canGoToParent: boolean;
    readonly canUndoCommit: boolean;
}

interface CommitContextMenuProps {
    readonly state: CommitContextMenuState;
    readonly onClose: () => void;
    readonly onCommand: (command: CommitCommand, hash: string, hashes: readonly string[]) => void;
    readonly onGoToChild: (hash: string) => void;
    readonly onGoToParent: (hash: string) => void;
}

type MenuItem =
    | {
        readonly kind: 'command';
        readonly label: string;
        readonly command: CommitCommand;
        readonly icon?: string;
        readonly accelerator?: string;
        readonly disabled?: (state: CommitContextMenuState) => boolean;
    }
    | {
        readonly kind: 'navigate';
        readonly label: string;
        readonly direction: 'child' | 'parent';
        readonly accelerator: string;
        readonly disabled: (state: CommitContextMenuState) => boolean;
    }
    | { readonly kind: 'separator' };

const MENU_ITEMS: readonly MenuItem[] = [
    { kind: 'command', label: 'Copy Revision Number', command: 'copyRevisionNumber', icon: 'copy', accelerator: 'Ctrl+Alt+Shift+C' },
    { kind: 'command', label: 'Create Patch...', command: 'createPatch', icon: 'diff-added' },
    { kind: 'command', label: 'Cherry-Pick', command: 'cherryPick', icon: 'git-pull-request' },
    { kind: 'separator' },
    { kind: 'command', label: 'Checkout Revision', command: 'checkoutRevision' },
    { kind: 'command', label: 'Show Repository at Revision', command: 'showRepositoryAtRevision' },
    { kind: 'command', label: 'Compare with Local', command: 'compareWithLocal' },
    { kind: 'separator' },
    { kind: 'command', label: 'Reset Current Branch to Here...', command: 'resetCurrentBranchToHere', icon: 'discard' },
    { kind: 'command', label: 'Revert Commit', command: 'revertCommit' },
    { kind: 'command', label: 'Undo Commit...', command: 'undoCommit', disabled: (state) => !state.canUndoCommit },
    { kind: 'separator' },
    { kind: 'command', label: 'Edit Commit Message...', command: 'editCommitMessage', accelerator: 'F2' },
    { kind: 'command', label: 'Fixup...', command: 'fixup' },
    { kind: 'command', label: 'Squash Into...', command: 'squashInto' },
    { kind: 'command', label: 'Drop Commit', command: 'dropCommit' },
    { kind: 'command', label: 'Interactively Rebase from Here...', command: 'interactiveRebaseFromHere' },
    { kind: 'command', label: 'Push All up to Here...', command: 'pushAllUpToHere' },
    { kind: 'separator' },
    { kind: 'command', label: 'New Branch...', command: 'newBranch', accelerator: 'Ctrl+Alt+N' },
    { kind: 'command', label: 'New Tag...', command: 'newTag' },
    { kind: 'separator' },
    { kind: 'navigate', label: 'Go to Child Commit', direction: 'child', accelerator: 'Left', disabled: (state) => !state.canGoToChild },
    { kind: 'navigate', label: 'Go to Parent Commit', direction: 'parent', accelerator: 'Right', disabled: (state) => !state.canGoToParent },
];

export function CommitContextMenu({ state, onClose, onCommand, onGoToChild, onGoToParent }: CommitContextMenuProps) {
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
            className="commit-context-menu"
            style={{ left: state.x, top: state.y }}
            role="menu"
        >
            {MENU_ITEMS.map((item, index) => renderMenuItem(item, index, state, onClose, onCommand, onGoToChild, onGoToParent))}
        </div>
    );
}

function renderMenuItem(
    item: MenuItem,
    index: number,
    state: CommitContextMenuState,
    onClose: () => void,
    onCommand: (command: CommitCommand, hash: string, hashes: readonly string[]) => void,
    onGoToChild: (hash: string) => void,
    onGoToParent: (hash: string) => void,
) {
    if (item.kind === 'separator') {
        return <div key={`separator-${index}`} className="commit-context-separator" role="separator" />;
    }

    const disabled = item.disabled?.(state) ?? false;
    const activate = () => {
        if (disabled) { return; }
        onClose();
        if (item.kind === 'command') {
            onCommand(item.command, state.hash, state.hashes);
        } else if (item.direction === 'child') {
            onGoToChild(state.hash);
        } else {
            onGoToParent(state.hash);
        }
    };

    return (
        <button
            key={item.label}
            type="button"
            className="commit-context-item"
            role="menuitem"
            disabled={disabled}
            onClick={activate}
        >
            <span className="commit-context-icon">
                {item.kind === 'command' && item.icon ? <i className={`codicon codicon-${item.icon}`} aria-hidden="true" /> : null}
            </span>
            <span className="commit-context-label">{item.label}</span>
            {'accelerator' in item ? <span className="commit-context-accelerator">{item.accelerator}</span> : null}
        </button>
    );
}
