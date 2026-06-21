import type { DiffExplainer } from '@application/ports/diff-explainer';
import type { Worktree } from '@application/ports/git-topology';
import { truncateText } from '@core/shared/text';
import { normalizeDiffExplanation } from '@core/shared/diff-explanation';

const MAX_SELECTED_DIFF_LENGTH = 48000;

export interface ExplainSelectedChangesInput {
    readonly stagedFilePaths: readonly string[];
    readonly unstagedFilePaths: readonly string[];
    readonly untrackedFilePaths: readonly string[];
}

export interface ExplainSelectedChangesResult {
    readonly explanation: string;
    readonly selectedFiles: readonly string[];
    readonly diffTruncated: boolean;
}

export class ExplainSelectedChangesUseCase {
    constructor(private readonly explainer: DiffExplainer) {}

    async execute(worktree: Worktree, input: ExplainSelectedChangesInput, signal?: AbortSignal): Promise<ExplainSelectedChangesResult> {
        const selectedFiles = selectedFileLabels(input);
        if (selectedFiles.length === 0) {
            throw new Error('Select changes before explaining a diff.');
        }

        const diff = await buildSelectedDiff(worktree, input, signal);
        if (!diff.trim()) {
            throw new Error('No selected diff can be explained.');
        }

        const truncatedDiff = truncateText(diff, MAX_SELECTED_DIFF_LENGTH);
        const explanation = normalizeDiffExplanation(await this.explainer.explainDiff({
            selectionLabel: 'Selected files',
            selectedItems: selectedFiles,
            diff: truncatedDiff.text,
            diffTruncated: truncatedDiff.truncated,
        }, signal));

        return {
            explanation,
            selectedFiles,
            diffTruncated: truncatedDiff.truncated,
        };
    }
}

async function buildSelectedDiff(worktree: Worktree, input: ExplainSelectedChangesInput, signal?: AbortSignal): Promise<string> {
    const chunks: string[] = [];
    if (input.stagedFilePaths.length > 0) {
        chunks.push(await labeledDiff('Staged changes', worktree.getIndexDiff(input.stagedFilePaths, signal)));
    }
    if (input.unstagedFilePaths.length > 0) {
        chunks.push(await labeledDiff('Unstaged changes', worktree.getWorkingTreeDiff(input.unstagedFilePaths, signal)));
    }
    for (const filePath of input.untrackedFilePaths) {
        chunks.push(await labeledDiff(`Untracked file: ${filePath}`, worktree.getPatch('untracked', [filePath], signal)));
    }
    return chunks.filter((chunk) => chunk.trim()).join('\n\n');
}

async function labeledDiff(label: string, diffPromise: Promise<string>): Promise<string> {
    const diff = await diffPromise;
    return diff.trim() ? `### ${label}\n${diff}` : '';
}

function selectedFileLabels(input: ExplainSelectedChangesInput): readonly string[] {
    return [
        ...input.stagedFilePaths.map((filePath) => `staged: ${filePath}`),
        ...input.unstagedFilePaths.map((filePath) => `unstaged: ${filePath}`),
        ...input.untrackedFilePaths.map((filePath) => `untracked: ${filePath}`),
    ];
}
