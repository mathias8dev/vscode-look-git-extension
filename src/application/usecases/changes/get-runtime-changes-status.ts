import type { GitReferenceOperations, GitStashOperations, GitStatusOperations, GitSubmoduleOperations } from '@application/ports/git-capabilities';
import type { GitStatus, GitStash } from '@core/git/domain/git-status';
import type { GitSubmodule } from '@core/git/domain/git-worktree';
import type { PageRequest } from '@core/git/domain/page';

export interface ChangesStatusWarning {
    readonly operation: string;
    readonly error: unknown;
}

export interface RuntimeChangesStatusResult {
    readonly status: GitStatus;
    readonly stashes: readonly GitStash[];
    readonly submodules: readonly GitSubmodule[];
    readonly currentBranch: string | undefined;
    readonly warnings: readonly ChangesStatusWarning[];
}

export class GetRuntimeChangesStatusUseCase {
    constructor(private readonly stashPage: PageRequest = { limit: 100 }) {}

    async execute(
        repository: GitReferenceOperations & GitSubmoduleOperations,
        worktree: GitStatusOperations & GitStashOperations,
        signal?: AbortSignal,
    ): Promise<RuntimeChangesStatusResult> {
        const [status, stashesPage, submodulesResult, branchesResult] = await Promise.all([
            worktree.getStatus(signal),
            worktree.listStashes(this.stashPage, signal),
            settleOptional('changes/listSubmodules', repository.listSubmodules(signal)),
            settleOptional('changes/listBranches', repository.listBranches(signal)),
        ]);

        const warnings: ChangesStatusWarning[] = [];
        const submodules = optionalValue(submodulesResult, warnings);
        const branches = optionalValue(branchesResult, warnings);
        const currentBranch = branches.find((branch) => branch.isCurrent)?.name;

        return {
            status,
            stashes: stashesPage.items,
            submodules,
            currentBranch,
            warnings,
        };
    }
}

async function settleOptional<T>(
    operation: string,
    promise: Promise<readonly T[]>,
): Promise<{ readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown }> {
    try {
        return { operation, status: 'fulfilled', value: await promise };
    } catch (error) {
        signalThrowIfAborted(error);
        return { operation, status: 'rejected', reason: error };
    }
}

function signalThrowIfAborted(error: unknown): void {
    if (error instanceof DOMException && error.name === 'AbortError') { throw error; }
    if (error instanceof Error && error.name === 'AbortError') { throw error; }
}

function optionalValue<T>(
    result: { readonly operation: string; readonly status: 'fulfilled'; readonly value: readonly T[] } | { readonly operation: string; readonly status: 'rejected'; readonly reason: unknown },
    warnings: ChangesStatusWarning[],
): readonly T[] {
    if (result.status === 'fulfilled') { return result.value; }
    warnings.push({ operation: result.operation, error: result.reason });
    return [];
}
