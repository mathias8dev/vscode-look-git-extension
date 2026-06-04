const CHANGES_ITEM_CONTEXT = JSON.stringify({ preventDefaultContextMenuItems: true });
const CHANGES_SUBMODULE_TOOLBAR_CONTEXT = JSON.stringify({
    webviewSection: 'changesSubmoduleToolbar',
    preventDefaultContextMenuItems: true,
});
const CHANGES_COMMIT_COMPOSER_CONTEXT = JSON.stringify({
    webviewSection: 'changesCommitComposer',
    preventDefaultContextMenuItems: true,
});

export interface ChangesSelectionContextFlags {
    readonly canStage: boolean;
    readonly canUnstage: boolean;
    readonly canStash: boolean;
    readonly canCreatePatch: boolean;
    readonly canDiscard: boolean;
}

export function changesItemContext(): string {
    return CHANGES_ITEM_CONTEXT;
}

export function changesSubmoduleToolbarContext(): string {
    return CHANGES_SUBMODULE_TOOLBAR_CONTEXT;
}

export function changesCommitComposerContext(): string {
    return CHANGES_COMMIT_COMPOSER_CONTEXT;
}

export function changesSelectionContext(flags: ChangesSelectionContextFlags): string {
    return JSON.stringify({
        webviewSection: 'changesSelection',
        preventDefaultContextMenuItems: true,
        changesSelectionCanStage: flags.canStage,
        changesSelectionCanUnstage: flags.canUnstage,
        changesSelectionCanStash: flags.canStash,
        changesSelectionCanCreatePatch: flags.canCreatePatch,
        changesSelectionCanDiscard: flags.canDiscard,
    });
}
