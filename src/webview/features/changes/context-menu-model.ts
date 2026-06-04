const CHANGES_ITEM_CONTEXT = JSON.stringify({ preventDefaultContextMenuItems: true });
const CHANGES_SUBMODULE_TOOLBAR_CONTEXT = JSON.stringify({
    webviewSection: 'changesSubmoduleToolbar',
    preventDefaultContextMenuItems: true,
});
const CHANGES_COMMIT_COMPOSER_CONTEXT = JSON.stringify({
    webviewSection: 'changesCommitComposer',
    preventDefaultContextMenuItems: true,
});

export function changesItemContext(): string {
    return CHANGES_ITEM_CONTEXT;
}

export function changesSubmoduleToolbarContext(): string {
    return CHANGES_SUBMODULE_TOOLBAR_CONTEXT;
}

export function changesCommitComposerContext(): string {
    return CHANGES_COMMIT_COMPOSER_CONTEXT;
}
