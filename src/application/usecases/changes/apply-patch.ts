import type { Worktree } from '@application/ports/git-topology';

export enum ApplyPatchMode {
    WorkingTree,
    Index,
}

export enum ApplyPatchResultKind {
    Applied,
    AppliedWithConflicts,
}

export interface ApplyPatchResult {
    readonly kind: ApplyPatchResultKind;
}

export class ApplyPatchUseCase {
    async preflight(worktree: Worktree, patch: string, _mode: ApplyPatchMode): Promise<void> {
        if (!await worktree.checkPatch(patch)) { throw new Error('Patch cannot be applied cleanly.'); }
    }

    async execute(worktree: Worktree, patch: string, mode: ApplyPatchMode): Promise<ApplyPatchResult> {
        if (mode === ApplyPatchMode.Index) {
            await worktree.applyPatchToIndex(patch, { threeWay: true });
        } else {
            await worktree.applyPatch(patch, { threeWay: true });
        }
        const status = await worktree.getStatus();
        return {
            kind: status.conflicts.length > 0
                ? ApplyPatchResultKind.AppliedWithConflicts
                : ApplyPatchResultKind.Applied,
        };
    }
}
