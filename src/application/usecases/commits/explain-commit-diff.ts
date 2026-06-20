import type { DiffExplainer } from '../../ports/diff-explainer';
import type { GitHistoryOperations } from '../../ports/git-capabilities';
import { orderSelectedCommits } from './order-selected-commits';

const MAX_COMMIT_DIFF_LENGTH = 64000;

export interface ExplainCommitDiffResult {
    readonly explanation: string;
    readonly selectedCommits: readonly string[];
    readonly diffTruncated: boolean;
}

type ExplainRepository = Pick<GitHistoryOperations, 'orderCommits' | 'getCommitPatch' | 'getCommitMessage'>;

export class ExplainCommitDiffUseCase {
    constructor(private readonly explainer: DiffExplainer) {}

    async execute(repo: ExplainRepository, hashes: readonly string[], signal?: AbortSignal): Promise<ExplainCommitDiffResult> {
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

export function normalizeDiffExplanation(rawExplanation: string): string {
    const normalized = stripCodeFence(rawExplanation.trim()).trim();
    if (!normalized) {
        throw new Error('The language model returned an empty diff explanation.');
    }
    return normalized;
}

async function buildCommitDiff(repo: ExplainRepository, hashes: readonly string[], signal?: AbortSignal): Promise<string> {
    const chunks = await Promise.all(hashes.map(async (hash) => {
        const [message, patch] = await Promise.all([
            repo.getCommitMessage(hash, signal),
            repo.getCommitPatch(hash, signal),
        ]);
        return patch.trim() ? `### Commit ${hash}\n${message}\n\n${patch}` : '';
    }));
    return chunks.filter((chunk) => chunk.length > 0).join('\n\n');
}

function truncateText(value: string, maxLength: number): { readonly text: string; readonly truncated: boolean } {
    if (value.length <= maxLength) { return { text: value, truncated: false }; }
    return { text: value.slice(0, maxLength), truncated: true };
}

function stripCodeFence(value: string): string {
    const match = value.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? value;
}
