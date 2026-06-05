import * as vscode from 'vscode';

const lookGitDiffScheme = 'lookgit-diff';

class ReadonlyDiffDocumentProvider implements vscode.TextDocumentContentProvider {
    private readonly contents = new Map<string, string>();
    private nextId = 0;

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) ?? '';
    }

    createUri(title: string, content: string, extension: string): vscode.Uri {
        const name = sanitizeTitle(title);
        const uri = vscode.Uri.parse(`${lookGitDiffScheme}:/${++this.nextId}/${name}.${extension}`);
        this.contents.set(uri.toString(), content);
        return uri;
    }
}

const provider = new ReadonlyDiffDocumentProvider();

export function registerReadonlyDiffDocumentProvider(): vscode.Disposable {
    return vscode.workspace.registerTextDocumentContentProvider(lookGitDiffScheme, provider);
}

export function createReadonlyDocumentUri(title: string, content: string, extension: string): vscode.Uri {
    return provider.createUri(title, content, extension);
}

export async function openReadonlyDiffDocument(title: string, content: string): Promise<void> {
    const uri = provider.createUri(title, content || `${title}\n`, 'diff');
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
}

export async function openReadonlyMarkdownDocument(title: string, content: string): Promise<void> {
    const uri = provider.createUri(title, content || `${title}\n`, 'md');
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: false });
}

function sanitizeTitle(title: string): string {
    const normalized = title.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized || 'diff';
}
