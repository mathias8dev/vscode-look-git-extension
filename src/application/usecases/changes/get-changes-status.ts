import type { GitRepository } from '../../ports/git-repository';
import type { GitStatus, GitStash } from '../../../core/git/domain/GitStatus';
import type { GitSubmodule } from '../../../core/git/domain/GitWorktree';

export interface ChangesStatusWarning {
    readonly operation: string;
    readonly error: unknown;
}

export interface ChangesStatusResult {
    readonly status: GitStatus;
    readonly stashes: readonly GitStash[];
    readonly submodules: readonly GitSubmodule[];
    readonly warnings: readonly ChangesStatusWarning[];
}

export class GetChangesStatusUseCase {
    async execute(repo: GitRepository, signal?: AbortSignal): Promise<ChangesStatusResult> {
        const [status, stashes, submodulesResult] = await Promise.all([
            repo.getStatus(signal),
            repo.stashList(signal),
            settleOptional('changes/listSubmodules', repo.getSubmoduleStatus(signal)),
        ]);
        const warnings: ChangesStatusWarning[] = [];
        const submodules = optionalValue(submodulesResult, warnings);
        return { status, stashes, submodules, warnings };
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
