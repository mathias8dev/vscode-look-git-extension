import type { GitCompareOperations, GitHistoryOperations, GitReferenceOperations } from '@application/ports/git-capabilities';
import type { ChangedFilesPage } from '@core/git/domain/git-comparison';
import type { GitCommit } from '@core/git/domain/git-commit';
import type { Page } from '@core/git/domain/page';

type ComparisonRepository = Pick<GitReferenceOperations, 'resolveRef'>
    & Pick<GitHistoryOperations, 'getMergeBase' | 'getCommitRange' | 'getAheadBehind'>
    & Pick<GitCompareOperations, 'listChangedFiles'>;

export interface BranchComparisonResult {
    readonly baseHash: string;
    readonly headHash: string;
    readonly leftHash: string;
    readonly files: ChangedFilesPage;
    readonly commits: Page<GitCommit>;
    readonly commitCount: number;
}

export class GetBranchComparison {
    async execute(repository: ComparisonRepository, baseRef: string, headRef: string, sinceDivergence: boolean, signal: AbortSignal): Promise<BranchComparisonResult> {
        const [baseHash, headHash] = await Promise.all([repository.resolveRef(baseRef, signal), repository.resolveRef(headRef, signal)]);
        const leftHash = sinceDivergence ? await repository.getMergeBase(baseHash, headHash, signal) : baseHash;
        const [files, commits, counts] = await Promise.all([
            repository.listChangedFiles(leftHash, headHash, { limit: 100 }, signal),
            repository.getCommitRange(baseHash, headHash, { limit: 50 }, signal),
            repository.getAheadBehind(headHash, baseHash, signal),
        ]);
        signal.throwIfAborted();
        return { baseHash, headHash, leftHash, files, commits, commitCount: counts.ahead };
    }
}
