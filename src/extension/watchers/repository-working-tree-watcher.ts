import * as path from 'path';
import * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';

export class RepositoryWorkingTreeWatcher implements vscode.Disposable {
    private readonly watchers = new Map<string, vscode.Disposable>();

    constructor(
        private readonly onDidChange: () => void,
    ) {}

    setContexts(contexts: readonly RepoContext[]): void {
        const nextKeys = new Set(contexts.map((context) => normalizedPath(context.cwd)));
        for (const [key, disposable] of this.watchers) {
            if (nextKeys.has(key)) { continue; }
            disposable.dispose();
            this.watchers.delete(key);
        }
        for (const context of contexts) {
            const key = normalizedPath(context.cwd);
            if (this.watchers.has(key)) { continue; }
            this.watchers.set(key, this.watchContext(context.cwd));
        }
    }

    dispose(): void {
        for (const disposable of this.watchers.values()) {
            disposable.dispose();
        }
        this.watchers.clear();
    }

    private watchContext(cwd: string): vscode.Disposable {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(cwd), '**'));
        const disposables = [
            watcher,
            watcher.onDidChange((uri) => this.handleChange(cwd, uri)),
            watcher.onDidCreate((uri) => this.handleChange(cwd, uri)),
            watcher.onDidDelete((uri) => this.handleChange(cwd, uri)),
        ];
        return { dispose: () => disposables.forEach((disposable) => disposable.dispose()) };
    }

    private handleChange(cwd: string, uri: vscode.Uri): void {
        if (!isWorkingTreeChangePath(cwd, uri.fsPath)) { return; }
        this.onDidChange();
    }
}

export function isWorkingTreeChangePath(cwd: string, resourcePath: string): boolean {
    const relativePath = path.relative(normalizedPath(cwd), normalizedPath(resourcePath));
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) { return false; }
    return !relativePath.split(/[\\/]+/).includes('.git');
}

function normalizedPath(value: string): string {
    return path.normalize(value);
}
