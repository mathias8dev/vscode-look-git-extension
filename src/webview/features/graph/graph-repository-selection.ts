import type { RepositoryLocator } from '@protocol/shared/repo';

export type GraphRepositorySelection =
    | { readonly kind: 'main' }
    | { readonly kind: 'submodule'; readonly path: string; readonly label: string };

export function mainGraphRepositorySelection(): GraphRepositorySelection {
    return { kind: 'main' };
}

export function submoduleGraphRepositorySelection(path: string, label: string): GraphRepositorySelection {
    return { kind: 'submodule', path, label };
}

export function graphRepositorySelectionKey(selection: GraphRepositorySelection): string {
    if (selection.kind === 'main') { return 'main'; }
    return `submodule:${selection.path}`;
}

export function sameRepositoryLocator(a: RepositoryLocator | undefined, b: RepositoryLocator | undefined): boolean {
    if (!a || !b) { return a === b; }
    return a.repoId === b.repoId
        && a.kind === b.kind
        && a.path === b.path
        && a.parentRepoId === b.parentRepoId;
}
