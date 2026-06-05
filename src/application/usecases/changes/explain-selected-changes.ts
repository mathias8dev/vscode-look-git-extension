import type { DiffExplainer } from '../../ports/diff-explainer';
import type { GitRepository } from '../../ports/git-repository';

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

    async execute(repo: GitRepository, input: ExplainSelectedChangesInput, signal?: AbortSignal): Promise<ExplainSelectedChangesResult> {
        const selectedFiles = selectedFileLabels(input);
        if (selectedFiles.length === 0) {
            throw new Error('Select changes before explaining a diff.');
        }

        const diff = await buildSelectedDiff(repo, input, signal);
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

export function normalizeDiffExplanation(rawExplanation: string): string {
    const normalized = stripCodeFence(rawExplanation.trim()).trim();
    if (!normalized) {
        throw new Error('The language model returned an empty diff explanation.');
    }
    return normalized;
}

async function buildSelectedDiff(repo: GitRepository, input: ExplainSelectedChangesInput, signal?: AbortSignal): Promise<string> {
    const chunks: string[] = [];
    if (input.stagedFilePaths.length > 0) {
        chunks.push(await labeledDiff('Staged changes', repo.execRaw([
            'diff',
            '--cached',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            ...input.stagedFilePaths,
        ], signal)));
    }
    if (input.unstagedFilePaths.length > 0) {
        chunks.push(await labeledDiff('Unstaged changes', repo.execRaw([
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            ...input.unstagedFilePaths,
        ], signal)));
    }
    for (const filePath of input.untrackedFilePaths) {
        chunks.push(await labeledDiff(`Untracked file: ${filePath}`, diffUntrackedFile(repo, filePath, signal)));
    }
    return chunks.filter((chunk) => chunk.trim()).join('\n\n');
}

async function labeledDiff(label: string, diffPromise: Promise<string>): Promise<string> {
    const diff = await diffPromise;
    return diff.trim() ? `### ${label}\n${diff}` : '';
}

async function diffUntrackedFile(repo: GitRepository, filePath: string, signal?: AbortSignal): Promise<string> {
    try {
        return await repo.execRaw(['diff', '--no-index', '--unified=3', '--', '/dev/null', filePath], signal);
    } catch (error) {
        const stdout = stdoutFromExecError(error);
        if (stdout !== undefined) { return stdout; }
        throw error;
    }
}

function selectedFileLabels(input: ExplainSelectedChangesInput): readonly string[] {
    return [
        ...input.stagedFilePaths.map((filePath) => `staged: ${filePath}`),
        ...input.unstagedFilePaths.map((filePath) => `unstaged: ${filePath}`),
        ...input.untrackedFilePaths.map((filePath) => `untracked: ${filePath}`),
    ];
}

function truncateText(value: string, maxLength: number): { readonly text: string; readonly truncated: boolean } {
    if (value.length <= maxLength) { return { text: value, truncated: false }; }
    return { text: value.slice(0, maxLength), truncated: true };
}

function stripCodeFence(value: string): string {
    const match = value.match(/^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? value;
}

function stdoutFromExecError(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('stdout' in error)) { return undefined; }
    const stdout = (error as { readonly stdout?: unknown }).stdout;
    return typeof stdout === 'string' ? stdout : undefined;
}
