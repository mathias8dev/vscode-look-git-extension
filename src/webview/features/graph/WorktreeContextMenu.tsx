import { useEffect, useRef } from 'react';
import type { WorktreeCommand } from '../../../protocol/graph/messages';
import type { WorktreeInfo } from '../../../protocol/graph/types';

export interface WorktreeContextMenuState {
    readonly worktree: WorktreeInfo;
    readonly x: number;
    readonly y: number;
}

interface WorktreeContextMenuProps {
    readonly state: WorktreeContextMenuState;
    readonly onClose: () => void;
    readonly onCommand: (command: WorktreeCommand, path: string) => void;
    readonly onShowDetails: (path: string) => void;
}

type WorktreeMenuItem =
    | {
        readonly kind: 'command';
        readonly label: string;
        readonly command: WorktreeCommand;
        readonly icon?: string;
        readonly disabled?: (state: WorktreeContextMenuState) => boolean;
    }
    | {
        readonly kind: 'details';
        readonly label: string;
        readonly icon?: string;
    }
    | { readonly kind: 'separator' };

const MENU_ITEMS: readonly WorktreeMenuItem[] = [
    { kind: 'command', label: 'Open', command: 'open', icon: 'folder-opened' },
    { kind: 'command', label: 'Open in New Window', command: 'openInNewWindow', icon: 'empty-window' },
    { kind: 'command', label: 'Reveal in File Explorer', command: 'reveal', icon: 'folder' },
    { kind: 'separator' },
    { kind: 'details', label: 'Show Details', icon: 'list-tree' },
    { kind: 'command', label: 'Show Diff with HEAD', command: 'showDiffWithHead', icon: 'diff' },
    { kind: 'command', label: 'Show Diff with Main Worktree', command: 'showDiffWithMainWorktree', icon: 'compare-changes', disabled: (state) => state.worktree.isMain },
    { kind: 'separator' },
    { kind: 'command', label: 'Fetch', command: 'fetch', icon: 'cloud-download' },
    { kind: 'command', label: 'Pull', command: 'pull', icon: 'git-pull-request' },
    { kind: 'command', label: 'Push', command: 'push', icon: 'cloud-upload' },
    { kind: 'command', label: 'Commit...', command: 'commit', icon: 'git-commit' },
    { kind: 'command', label: 'Stash Changes', command: 'stash', icon: 'archive' },
    { kind: 'separator' },
    { kind: 'command', label: 'New Branch from HEAD...', command: 'newBranch', icon: 'add' },
    { kind: 'command', label: 'Checkout Branch...', command: 'checkoutBranch', icon: 'git-branch' },
    { kind: 'separator' },
    { kind: 'command', label: 'Lock Worktree', command: 'lock', icon: 'lock', disabled: (state) => state.worktree.isMain || state.worktree.isLocked },
    { kind: 'command', label: 'Unlock Worktree', command: 'unlock', icon: 'unlock', disabled: (state) => state.worktree.isMain || !state.worktree.isLocked },
    { kind: 'command', label: 'Remove...', command: 'remove', icon: 'trash', disabled: (state) => state.worktree.isMain },
    { kind: 'command', label: 'Force Remove...', command: 'removeForce', icon: 'trash', disabled: (state) => state.worktree.isMain },
];

export function WorktreeContextMenu({ state, onClose, onCommand, onShowDetails }: WorktreeContextMenuProps) {
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
            className="commit-context-menu worktree-context-menu"
            style={{ left: state.x, top: state.y }}
            role="menu"
        >
            {MENU_ITEMS.map((item, index) => renderMenuItem(item, index, state, onClose, onCommand, onShowDetails))}
        </div>
    );
}

function renderMenuItem(
    item: WorktreeMenuItem,
    index: number,
    state: WorktreeContextMenuState,
    onClose: () => void,
    onCommand: (command: WorktreeCommand, path: string) => void,
    onShowDetails: (path: string) => void,
) {
    if (item.kind === 'separator') {
        return <div key={`separator-${index}`} className="commit-context-separator" role="separator" />;
    }

    const disabled = item.kind === 'command' ? item.disabled?.(state) ?? false : false;
    const activate = () => {
        if (disabled) { return; }
        onClose();
        if (item.kind === 'details') {
            onShowDetails(state.worktree.path);
        } else {
            onCommand(item.command, state.worktree.path);
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
                {item.icon ? <i className={`codicon codicon-${item.icon}`} aria-hidden="true" /> : null}
            </span>
            <span className="commit-context-label">{item.label}</span>
        </button>
    );
}
