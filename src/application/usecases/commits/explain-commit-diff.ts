import type { DiffExplainer } from '@application/ports/diff-explainer';
import type { GitRepository } from '@application/ports/git-topology';
import { truncateText } from '@core/shared/text';
import { normalizeDiffExplanation } from '@core/shared/diff-explanation';
import { orderSelectedCommits } from '@application/usecases/commits/order-selected-commits';

const MAX_COMMIT_DIFF_LENGTH = 64000;

export interface ExplainCommitDiffResult {
    readonly explanation: string;
    readonly selectedCommits: readonly string[];
    readonly diffTruncated: boolean;
}


export class ExplainCommitDiffUseCase {
    constructor(private readonly explainer: DiffExplainer) {}

    async execute(repo: GitRepository, hashes: readonly string[], signal?: AbortSignal): Promise<ExplainCommitDiffResult> {
        const orderedHashes = await orderSelectedCommits(repo, hashes, 'oldestFirst');
        if (orderedHashes.length === 0) {
            throw new Error('Select a commit before explaining its diff.');
        }

        const diff = await buildCommitDiff(repo, orderedHashes, signal);
        if (!diff.trim()) {
            throw new Error('No selected commit diff can be explained.');
        }

        const truncatedDiff = truncateText(diff, MAX_COMMIT_DIFF_LENGTH);
        const selectedCommits = orderedHashes.map((hash) => `commit: ${hash}`);
        const explanation = normalizeDiffExplanation(await this.explainer.explainDiff({
            selectionLabel: 'Selected commits',
            selectedItems: selectedCommits,
            diff: truncatedDiff.text,
            diffTruncated: truncatedDiff.truncated,
        }, signal));

        return {
            explanation,
            selectedCommits,
            diffTruncated: truncatedDiff.truncated,
        };
    }
}


async function buildCommitDiff(repo: GitRepository, hashes: readonly string[], signal?: AbortSignal): Promise<string> {
    const chunks = await Promise.all(hashes.map(async (hash) => {
        const [message, patch] = await Promise.all([
            repo.getCommitMessage(hash, signal),
            repo.getCommitPatch(hash, signal),
        ]);
        return patch.trim() ? `### Commit ${hash}\n${message}\n\n${patch}` : '';
    }));
    return chunks.filter((chunk) => chunk.length > 0).join('\n\n');
}
