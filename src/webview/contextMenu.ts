export interface MenuItem {
    label: string;
    command: string;
    separator?: boolean;
    disabled?: boolean;
}

export const COMMIT_MENU_ITEMS: MenuItem[] = [
    { label: 'Cherry-pick Commit', command: 'lookGit.cherryPick' },
    { label: 'Revert Commit', command: 'lookGit.revert' },
    { label: 'Rebase onto Commit', command: 'lookGit.rebase' },
    { label: 'Reset to Commit', command: 'lookGit.reset' },
    { label: 'Checkout Revision', command: 'lookGit.checkout' },
    { label: '', command: '', separator: true },
    { label: 'Drop Commit', command: 'lookGit.drop' },
    { label: 'Edit Commit Message', command: 'lookGit.renameCommit' },
    { label: 'Fixup Commit', command: 'lookGit.fixup' },
    { label: '', command: '', separator: true },
    { label: 'Copy Commit Hash', command: 'lookGit.copyCommitHash' },
];

let activeMenu: HTMLElement | null = null;

export function showContextMenu(
    x: number,
    y: number,
    items: MenuItem[],
    onCommand: (command: string) => void,
): void {
    hideContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    for (const item of items) {
        if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'context-menu-separator';
            menu.appendChild(sep);
            continue;
        }

        const el = document.createElement('div');
        el.className = 'context-menu-item' + (item.disabled ? ' disabled' : '');
        el.textContent = item.label;
        if (!item.disabled) {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                hideContextMenu();
                onCommand(item.command);
            });
        }
        menu.appendChild(el);
    }

    document.body.appendChild(menu);
    activeMenu = menu;

    // Adjust position if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }

    // Close on click outside or Escape
    const closeHandler = () => {
        hideContextMenu();
        document.removeEventListener('click', closeHandler);
    };
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            hideContextMenu();
            document.removeEventListener('keydown', escHandler);
        }
    };
    // Delay to avoid immediate close from the same right-click
    setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('keydown', escHandler);
    }, 0);
}

export function showCommitContextMenu(
    x: number,
    y: number,
    commitHash: string,
    onCommand: (command: string, commitHash: string) => void,
): void {
    showContextMenu(x, y, COMMIT_MENU_ITEMS, (command) => {
        onCommand(command, commitHash);
    });
}

export function hideContextMenu(): void {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}
