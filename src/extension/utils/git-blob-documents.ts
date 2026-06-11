import * as vscode from 'vscode';

const gitBlobScheme = 'lookgit-blob';

/**
 * Serves immutable Git blob content (and empty placeholders) as in-memory,
 * read-only documents. The URI preserves the real file path so the diff editor
 * shows the actual filename — keeping the tab label readable and letting VS Code
 * detect the language for syntax highlighting. No temporary files are written.
 */
class GitBlobDocumentProvider implements vscode.TextDocumentContentProvider {
    private readonly contents = new Map<string, string>();

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.contents.get(uri.toString()) ?? '';
    }

    createUri(namespace: string, filePath: string, side: string, content: string): vscode.Uri {
        const uri = vscode.Uri.from({ scheme: gitBlobScheme, path: blobPath(namespace, side, filePath) });
        this.contents.set(uri.toString(), content);
        return uri;
    }
}

const provider = new GitBlobDocumentProvider();

export function registerGitBlobDocumentProvider(): vscode.Disposable {
    return vscode.workspace.registerTextDocumentContentProvider(gitBlobScheme, provider);
}

/**
 * Build a read-only document URI for the given blob/empty content. The trailing
 * path segment keeps the original filename (and extension) so the editor labels
 * and highlights it correctly. `namespace` (a ref/commit) and `side` keep the two
 * sides of a diff distinct without colliding across files or revisions.
 */
export function gitBlobUri(namespace: string, filePath: string, side: string, content: string): vscode.Uri {
    return provider.createUri(namespace, filePath, side, content);
}

function blobPath(namespace: string, side: string, filePath: string): string {
    const prefix = sanitizeSegment(`${side}-${namespace}`);
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `/${prefix}/${normalized}`;
}

function sanitizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'blob';
}
