import type { GitRepository } from '../../ports/git-repository';

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
    async preflight(repo: GitRepository, patchFilePath: string, mode: ApplyPatchMode): Promise<void> {
        await repo.exec(applyPatchArgs(patchFilePath, mode, true));
    }

    async execute(repo: GitRepository, patchFilePath: string, mode: ApplyPatchMode): Promise<ApplyPatchResult> {
        await repo.exec(applyPatchArgs(patchFilePath, mode, false));
        const status = await repo.getStatus();
        return {
            kind: status.conflicts.length > 0
                ? ApplyPatchResultKind.AppliedWithConflicts
                : ApplyPatchResultKind.Applied,
        };
    }
}

function applyPatchArgs(patchFilePath: string, mode: ApplyPatchMode, check: boolean): readonly string[] {
    return [
        'apply',
        ...(check ? ['--check'] : []),
        '--3way',
        ...(mode === ApplyPatchMode.Index ? ['--index'] : []),
        patchFilePath,
    ];
}
