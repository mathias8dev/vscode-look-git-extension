import * as vscode from 'vscode';
import { openReadonlyMarkdownDocument } from './readonly-diff-documents';

export interface DiffExplanationDocument {
    readonly title: string;
    readonly itemsTitle: string;
    readonly items: readonly string[];
    readonly explanation: string;
    readonly diffTruncated: boolean;
    readonly scope?: string;
    readonly scopeLabel?: string;
}

export async function openDiffExplanationDocument(input: DiffExplanationDocument): Promise<void> {
    await openReadonlyMarkdownDocument(input.title, diffExplanationDocumentContent(input));
}

export async function showDiffExplanationError(error: unknown): Promise<void> {
    const output = vscode.window.createOutputChannel('Look Git');
    output.clear();
    output.appendLine('Diff explanation failed.');
    output.appendLine('');
    output.appendLine(errorDetails(error));
    const action = await vscode.window.showErrorMessage('Could not explain selected diff.', 'Show Output');
    if (action === 'Show Output') { output.show(); }
}

function diffExplanationDocumentContent(input: DiffExplanationDocument): string {
    const scope = input.scope ? [`${input.scopeLabel ?? 'Scope'}: \`${escapeMarkdownInline(input.scope)}\``] : [];
    const items = input.items.map((item) => `- \`${escapeMarkdownInline(item)}\``).join('\n');
    const truncated = input.diffTruncated
        ? '\n\n> The diff was truncated before it was sent to the language model.'
        : '';
    return [
        `# ${input.title}`,
        ...scope,
        `## ${input.itemsTitle}`,
        items || '- (none)',
        '## Explanation',
        `${input.explanation}${truncated}`,
    ].join('\n\n');
}

function errorDetails(error: unknown): string {
    const parts = [
        error instanceof Error ? error.message : String(error),
        stringProperty(error, 'stdout'),
        stringProperty(error, 'stderr'),
    ].filter((part): part is string => Boolean(part));
    return Array.from(new Set(parts)).join('\n\n');
}

function stringProperty(value: unknown, key: 'stdout' | 'stderr'): string | undefined {
    if (typeof value !== 'object' || value === null) { return undefined; }
    const property = Object.getOwnPropertyDescriptor(value, key)?.value;
    return typeof property === 'string' ? property : undefined;
}

function escapeMarkdownInline(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
