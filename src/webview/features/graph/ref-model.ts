import type { BranchInfo } from '@protocol/graph/types';

export type RefKind = 'head' | 'local' | 'remote' | 'tag';

export interface ParsedRef {
    readonly label: string;
    readonly fullRef: string;
    readonly kind: RefKind;
}

export function parseRefs(refs: readonly string[], branches: readonly BranchInfo[]): ParsedRef[] {
    return refs
        .map((ref) => parseRef(ref, branches))
        .filter((r): r is ParsedRef => r !== null);
}

function parseRef(ref: string, branches: readonly BranchInfo[]): ParsedRef | null {
    const trimmed = ref.trim();
    if (!trimmed) { return null; }

    if (trimmed.startsWith('HEAD -> ')) {
        const label = trimmed.slice('HEAD -> '.length);
        return { label, fullRef: trimmed, kind: 'head' };
    }

    if (trimmed === 'HEAD') {
        return { label: 'HEAD', fullRef: 'HEAD', kind: 'head' };
    }

    if (trimmed.startsWith('tag: ')) {
        const label = trimmed.slice('tag: '.length);
        return { label, fullRef: trimmed, kind: 'tag' };
    }

    const branch = branches.find((b) => b.name === trimmed);
    if (branch) {
        return { label: trimmed, fullRef: trimmed, kind: branch.isRemote ? 'remote' : 'local' };
    }

    return { label: trimmed, fullRef: trimmed, kind: 'local' };
}
