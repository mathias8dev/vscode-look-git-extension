import type { GraphData } from './graphTypes';

export interface MenuItem {
    label: string;
    command: string;
    separator?: boolean;
    disabled?: boolean;
    title?: string;
}

const GO_TO_CHILD_COMMAND = 'lookGit.goToChildCommit';
const GO_TO_PARENT_COMMAND = 'lookGit.goToParentCommit';

export function getCommitMenuItems(graphData: GraphData | null, commitHash: string, selectedCommitHashes: string[] = [commitHash]): MenuItem[] {
    const row = graphData?.rows.find((candidate) => candidate.commit.hash === commitHash);
    const commit = row?.commit;
    const selectedHashes = selectedCommitHashes.includes(commitHash) ? selectedCommitHashes : [commitHash];
    const selectedCommits = selectedHashes
        .map((hash) => graphData?.rows.find((candidate) => candidate.commit.hash === hash)?.commit)
        .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    const hasMultiSelection = selectedCommits.length > 1;
    const currentBranch = graphData?.currentBranch ?? 'HEAD';
    const currentBranchLabel = currentBranch && currentBranch !== 'HEAD' ? currentBranch : 'current branch';
    const currentBranchRef = graphData?.branches.find((branch) => branch.isCurrent);
    const isHeadCommit = Boolean(commit && currentBranchRef && hashesMatch(commit.hash, currentBranchRef.hash));
    const selectionIncludesHead = Boolean(currentBranchRef && selectedCommits.some((selected) => hashesMatch(selected.hash, currentBranchRef.hash)));
    const parentCount = commit?.parentHashes.length ?? 0;
    const isMergeCommit = parentCount > 1;
    const selectionIncludesMerge = selectedCommits.some((selected) => selected.parentHashes.length > 1);
    const knowsCurrentBranchCommits = Boolean(graphData?.currentBranchCommitHashes?.length);
    const isOnCurrentBranch = !knowsCurrentBranchCommits || Boolean(
        commit && hashListIncludes(graphData?.currentBranchCommitHashes ?? [], commit.hash),
    );
    const selectionOnCurrentBranch = !knowsCurrentBranchCommits || selectedCommits.every((selected) => (
        hashListIncludes(graphData?.currentBranchCommitHashes ?? [], selected.hash)
    ));
    const selectionConsecutiveOnCurrentBranch = !knowsCurrentBranchCommits || areHashesConsecutive(
        graphData?.currentBranchCommitHashes ?? [],
        selectedCommits.map((selected) => selected.hash),
    );
    const hasCurrentBranch = currentBranch !== 'HEAD';
    const hasSingleParent = parentCount === 1;
    const hasLoadedParent = Boolean(
        commit?.parentHashes.some((parentHash) => graphData?.rows.some((candidate) => candidate.commit.hash === parentHash)),
    );
    const hasLoadedChild = Boolean(
        commit && graphData?.rows.some((candidate) => candidate.commit.parentHashes.includes(commit.hash)),
    );
    const canRewriteCommit = Boolean(commit) && hasCurrentBranch && !isMergeCommit && isOnCurrentBranch;
    const canRewriteSelection = selectedCommits.length > 0 && hasCurrentBranch && !selectionIncludesMerge && selectionOnCurrentBranch;
    const canFoldIntoParent = canRewriteCommit && hasSingleParent;
    const hasRemotes = graphData?.hasRemotes === true;
    const hasRepositoryWebUrl = Boolean(graphData?.repositoryWebUrl);

    return [
        { label: hasMultiSelection ? 'Copy Revision Numbers' : 'Copy Revision Number', command: 'lookGit.copyCommitHash' },
        { label: hasMultiSelection ? 'Create Patches...' : 'Create Patch...', command: 'lookGit.createPatch', disabled: selectionIncludesMerge, title: 'Create patch is unavailable for merge commits.' },
        { label: 'Cherry-Pick', command: 'lookGit.cherryPick', disabled: selectionIncludesMerge || selectionIncludesHead, title: 'Cherry-pick is unavailable for merge commits or the current HEAD.' },
        { label: '', command: '', separator: true },
        { label: 'Checkout Revision', command: 'lookGit.checkout', disabled: hasMultiSelection || isHeadCommit },
        { label: 'Show Repository at Revision', command: 'lookGit.showRepositoryAtRevision', disabled: hasMultiSelection },
        { label: 'Compare with Local', command: 'lookGit.compareWithLocal', disabled: hasMultiSelection },
        { label: '', command: '', separator: true },
        { label: 'Reset Current Branch to Here...', command: 'lookGit.reset', disabled: hasMultiSelection },
        { label: hasMultiSelection ? 'Revert Commits' : 'Revert Commit', command: 'lookGit.revert', disabled: selectionIncludesMerge, title: 'Reverting merge commits needs a mainline parent.' },
        { label: 'Undo Commit...', command: 'lookGit.undoCommit', disabled: hasMultiSelection || !isHeadCommit || !hasSingleParent, title: 'Only the latest non-root commit can be undone.' },
        { label: '', command: '', separator: true },
        { label: 'Edit Commit Message...', command: 'lookGit.renameCommit', disabled: hasMultiSelection || !canRewriteCommit, title: 'Editing is available for a single non-merge commit on the current branch.' },
        { label: 'Fixup...', command: 'lookGit.fixup', disabled: hasMultiSelection || !canFoldIntoParent, title: 'Fixup needs a single normal commit with one parent on the current branch.' },
        { label: 'Squash Into...', command: 'lookGit.squashIntoParent', disabled: hasMultiSelection || !canFoldIntoParent, title: 'Squash into needs a single normal commit with one parent on the current branch.' },
        { label: 'Drop Commits...', command: 'lookGit.drop', disabled: !canRewriteSelection, title: 'Dropping is available only for non-merge commits on the current branch.' },
        { label: 'Squash Commits...', command: 'lookGit.squash', disabled: selectedCommits.length < 2 || !canRewriteSelection || !selectionConsecutiveOnCurrentBranch, title: 'Select at least two consecutive non-merge commits on the current branch.' },
        { label: 'Interactively Rebase from Here...', command: 'lookGit.interactiveRebaseFrom', disabled: hasMultiSelection || !canRewriteCommit, title: 'Interactive rebase is available for a single non-merge commit on the current branch.' },
        { label: 'Push All up to Here...', command: 'lookGit.pushUpTo', disabled: hasMultiSelection || !hasCurrentBranch || !hasRemotes || !isOnCurrentBranch, title: 'A checked-out branch, a remote, and a commit on the current branch are required.' },
        { label: '', command: '', separator: true },
        { label: `Rebase '${currentBranchLabel}' onto Selected Commit`, command: 'lookGit.rebase', disabled: hasMultiSelection || !hasCurrentBranch || isHeadCommit },
        { label: 'New Branch...', command: 'lookGit.newBranchFromCommit', disabled: hasMultiSelection },
        { label: 'New Tag...', command: 'lookGit.newTagFromCommit', disabled: hasMultiSelection },
        { label: '', command: '', separator: true },
        { label: 'Go to Child Commit', command: GO_TO_CHILD_COMMAND, disabled: hasMultiSelection || !hasLoadedChild },
        { label: 'Go to Parent Commit', command: GO_TO_PARENT_COMMAND, disabled: hasMultiSelection || !hasLoadedParent },
        { label: '', command: '', separator: true },
        { label: 'View in Browser', command: 'lookGit.viewCommitInBrowser', disabled: hasMultiSelection || !hasRepositoryWebUrl, title: 'A supported web remote is required.' },
    ];
}

export function getCommitNavigationTarget(
    graphData: GraphData | null,
    commitHash: string,
    command: string,
): string | undefined {
    const row = graphData?.rows.find((candidate) => candidate.commit.hash === commitHash);
    if (!row) {
        return undefined;
    }

    if (command === GO_TO_PARENT_COMMAND) {
        return row.commit.parentHashes.find((parentHash) => (
            graphData?.rows.some((candidate) => candidate.commit.hash === parentHash)
        ));
    }

    if (command === GO_TO_CHILD_COMMAND) {
        return graphData?.rows.find((candidate) => candidate.commit.parentHashes.includes(row.commit.hash))?.commit.hash;
    }

    return undefined;
}

function hashesMatch(fullHash: string, maybeShortHash: string): boolean {
    return fullHash === maybeShortHash
        || fullHash.startsWith(maybeShortHash)
        || maybeShortHash.startsWith(fullHash);
}

function hashListIncludes(hashes: string[], hash: string): boolean {
    return hashes.some((candidate) => hashesMatch(candidate, hash));
}

function areHashesConsecutive(orderedHashes: string[], selectedHashes: string[]): boolean {
    if (selectedHashes.length < 2) {
        return true;
    }

    const indices = selectedHashes.map((hash) => orderedHashes.findIndex((candidate) => hashesMatch(candidate, hash)));
    if (indices.some((index) => index === -1)) {
        return false;
    }

    const sorted = [...indices].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] - sorted[i - 1] !== 1) {
            return false;
        }
    }
    return true;
}

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
    menu.style.overflowY = 'auto';
    menu.style.visibility = 'hidden';

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
        if (item.disabled && item.title) {
            el.title = item.title;
        }
        if (item.disabled) {
            el.setAttribute('aria-disabled', 'true');
        }
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

    positionContextMenu(menu, x, y);
    menu.style.visibility = '';

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

function positionContextMenu(menu: HTMLElement, x: number, y: number): void {
    const margin = 4;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = menu.getBoundingClientRect();
    const naturalHeight = Math.max(rect.height, menu.scrollHeight);
    const availableBelow = Math.max(0, viewportHeight - y - margin);
    const availableAbove = Math.max(0, y - margin);
    const maxViewportHeight = Math.max(0, viewportHeight - (margin * 2));

    let top = y;
    let maxHeight = Math.min(naturalHeight, maxViewportHeight);

    if (naturalHeight <= availableBelow) {
        top = y;
        maxHeight = naturalHeight;
    } else if (naturalHeight <= availableAbove) {
        top = y - naturalHeight;
        maxHeight = naturalHeight;
    } else if (availableBelow >= availableAbove) {
        top = y;
        maxHeight = availableBelow;
    } else {
        maxHeight = availableAbove;
        top = y - maxHeight;
    }

    const left = Math.max(margin, Math.min(x, viewportWidth - rect.width - margin));
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(margin, top)}px`;
    menu.style.maxHeight = `${Math.max(0, maxHeight)}px`;
}

export function showCommitContextMenu(
    x: number,
    y: number,
    commitHash: string,
    graphData: GraphData | null,
    selectedCommitHashes: string[],
    onCommand: (command: string, commitHash: string) => void,
): void {
    showContextMenu(x, y, getCommitMenuItems(graphData, commitHash, selectedCommitHashes), (command) => {
        onCommand(command, commitHash);
    });
}

export function hideContextMenu(): void {
    if (activeMenu) {
        activeMenu.remove();
        activeMenu = null;
    }
}
