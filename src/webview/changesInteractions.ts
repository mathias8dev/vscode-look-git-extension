interface FileSectionActions {
    postMessage(msg: unknown): void;
    getConflictState(): 'none' | 'merge' | 'rebase';
    toggleSection(sectionId: string | undefined): void;
    toggleTreeFolder(key: string): void;
    toggleStash(rawIndex: string): void;
}

const wiredFileSections = new WeakSet<HTMLElement>();

export function wireFileSectionHandlers(section: HTMLElement, actions: FileSectionActions): void {
    if (wiredFileSections.has(section)) {
        return;
    }

    wiredFileSections.add(section);
    section.addEventListener('click', (event) => handleFilesSectionClick(event, section, actions));
}

function handleFilesSectionClick(
    event: MouseEvent,
    section: HTMLElement,
    actions: FileSectionActions,
): void {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const directAction = getDirectFileAction(target, section, actions);
    if (directAction) {
        event.stopPropagation();
        directAction();
        return;
    }

    const sectionTitle = closestInSection<HTMLElement>(target, '.section-title-row', section);
    if (sectionTitle) {
        event.stopPropagation();
        actions.toggleSection(sectionTitle.closest<HTMLElement>('.section-header')?.dataset.section);
        return;
    }

    const treeFolder = closestInSection<HTMLElement>(target, '.tree-folder-row', section);
    if (treeFolder) {
        event.stopPropagation();
        actions.toggleTreeFolder(treeFolder.dataset.folderKey!);
        return;
    }

    const stashExpand = closestInSection<HTMLElement>(target, '.stash-expand-btn', section);
    if (stashExpand) {
        event.stopPropagation();
        actions.toggleStash(stashExpand.dataset.stashIndex!);
        return;
    }

    const stashFile = closestInSection<HTMLElement>(target, '.stash-file-row', section);
    if (stashFile) {
        event.stopPropagation();
        postStashDiff(stashFile.dataset, actions);
        return;
    }

    const conflictRow = closestInSection<HTMLElement>(target, '.conflict-file-row', section);
    if (conflictRow) {
        actions.postMessage({ type: 'openMergeEditor', filePath: conflictRow.dataset.file });
        return;
    }

    const fileRow = closestInSection<HTMLElement>(
        target,
        '.tree-file-row, .file-row:not(.stash-row):not(.conflict-file-row)',
        section,
    );
    if (fileRow) {
        if (fileRow.dataset.submodule === 'true') { return; } // gitlinks cannot be diffed
        postOpenDiff(fileRow.dataset, actions);
    }
}

function getDirectFileAction(
    target: Element,
    root: Element,
    actions: FileSectionActions,
): (() => void) | undefined {
    const messageActions: Array<[string, () => unknown]> = [
        ['#continue-op-btn', () => ({ type: 'continueOp', conflictState: actions.getConflictState() })],
        ['#abort-op-btn', () => ({ type: 'abortOp', conflictState: actions.getConflictState() })],
        ['#accept-all-theirs-btn', () => ({ type: 'acceptAllTheirs' })],
        ['#stage-all-btn', () => ({ type: 'stageAll' })],
        ['#stash-staged-btn', () => ({ type: 'stashStaged' })],
        ['#unstage-all-btn', () => ({ type: 'unstageAll' })],
        ['#discard-all-btn', () => ({ type: 'discardAll' })],
        ['.stash-btn', () => ({ type: 'stash' })],
    ];

    for (const [selector, buildMessage] of messageActions) {
        const button = closestInSection<HTMLElement>(target, selector, root);
        if (button) {
            return () => actions.postMessage(buildMessage());
        }
    }

    const fileActions: Array<[string, (filePath: string) => unknown]> = [
        ['.open-merge-btn', (filePath) => ({ type: 'openMergeEditor', filePath })],
        ['.accept-ours-btn', (filePath) => ({ type: 'acceptOurs', filePath })],
        ['.accept-theirs-btn', (filePath) => ({ type: 'acceptTheirs', filePath })],
        ['.mark-resolved-btn', (filePath) => ({ type: 'markResolved', filePath })],
        ['.stage-btn', (filePath) => ({ type: 'stageFile', filePath })],
        ['.unstage-btn', (filePath) => ({ type: 'unstageFile', filePath })],
        ['.discard-btn', (filePath) => ({ type: 'discardFile', filePath })],
        ['.open-file-btn', (filePath) => ({ type: 'openFile', filePath })],
        ['.open-submodule-btn', (filePath) => ({ type: 'openSubmodule', filePath })],
    ];

    for (const [selector, buildMessage] of fileActions) {
        const button = closestInSection<HTMLElement>(target, selector, root);
        if (button) {
            return () => actions.postMessage(buildMessage(button.dataset.file!));
        }
    }

    const stashActions: Array<[string, string]> = [
        ['.stash-pop-btn', 'stashPop'],
        ['.stash-apply-btn', 'stashApply'],
        ['.stash-drop-btn', 'stashDrop'],
    ];

    for (const [selector, type] of stashActions) {
        const button = closestInSection<HTMLElement>(target, selector, root);
        if (button) {
            return () => actions.postMessage({ type, index: Number(button.dataset.index) });
        }
    }

    return undefined;
}

function postOpenDiff(dataset: DOMStringMap, actions: FileSectionActions): void {
    actions.postMessage({
        type: 'openDiff',
        filePath: dataset.file,
        origPath: dataset.orig,
        isStaged: dataset.staged === 'true',
        status: dataset.status,
    });
}

function postStashDiff(dataset: DOMStringMap, actions: FileSectionActions): void {
    actions.postMessage({
        type: 'openStashDiff',
        filePath: dataset.file,
        origPath: dataset.orig,
        index: Number(dataset.stashIndex),
        status: dataset.status,
    });
}

function closestInSection<TElement extends Element>(
    target: Element,
    selector: string,
    root: Element,
): TElement | null {
    const match = target.closest(selector);
    return match && root.contains(match) ? match as TElement : null;
}
