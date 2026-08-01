import * as path from 'path';
import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { normalizePathForComparison } from '@extension/utils/path-compare';

interface RepositoryDiscoveryWatcherOptions {
    readonly markerExists?: (directoryPath: string) => boolean;
    readonly markerPollIntervalMs?: number;
}

const MARKER_RECONCILIATION_INTERVAL_MS = 1_000;

export class RepositoryDiscoveryWatcher implements vscode.Disposable {
    private readonly disposables: vscode.Disposable[] = [];
    private readonly rootWatchers = new Map<string, { readonly rootPath: string; readonly disposable: vscode.Disposable }>();
    private readonly markerAvailability = new Map<string, boolean>();
    private contextKeys = new Set<string>();
    private contextDirectories: readonly string[] = [];
    private readonly markerExists: (directoryPath: string) => boolean;

    constructor(
        private readonly onDidChange: () => void,
        options: RepositoryDiscoveryWatcherOptions = {},
    ) {
        this.markerExists = options.markerExists ?? hasGitMarker;
        // The broad pattern mirrors VS Code Git's discovery watcher; narrow .git globs can miss directory lifecycle events.
        this.disposables.push(...this.watchPattern('**'));
        this.syncRootWatchers();
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.syncRootWatchers();
                this.onDidChange();
            }),
            intervalDisposable(
                () => this.reconcileMarkers(),
                options.markerPollIntervalMs ?? MARKER_RECONCILIATION_INTERVAL_MS,
            ),
        );
    }

    setContexts(contexts: readonly RepoContext[]): void {
        this.contextKeys = new Set(contexts.map((context) => normalizePathForComparison(context.cwd)));
        this.contextDirectories = contexts.map((context) => context.cwd);
        this.syncRootWatchers();
    }

    dispose(): void {
        this.rootWatchers.forEach(({ disposable }) => disposable.dispose());
        this.rootWatchers.clear();
        this.markerAvailability.clear();
        this.contextKeys.clear();
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    private syncRootWatchers(): void {
        const roots = this.rootPaths();
        for (const [key, watcher] of this.rootWatchers) {
            if (roots.has(key)) { continue; }
            watcher.disposable.dispose();
            this.rootWatchers.delete(key);
            this.markerAvailability.delete(key);
        }
        for (const [key, rootPath] of roots) {
            if (this.rootWatchers.has(key)) { continue; }
            const disposables = this.watchPattern(new vscode.RelativePattern(vscode.Uri.file(rootPath), '**'));
            this.rootWatchers.set(key, {
                rootPath,
                disposable: { dispose: () => disposables.forEach((disposable) => disposable.dispose()) },
            });
            this.markerAvailability.set(key, this.markerExists(rootPath));
        }
    }

    private reconcileMarkers(): void {
        let changed = false;
        for (const [key, root] of this.rootWatchers) {
            const available = this.markerExists(root.rootPath);
            if (available !== this.markerAvailability.get(key)) { changed = true; }
            this.markerAvailability.set(key, available);
        }
        if (changed) { this.onDidChange(); }
    }

    private rootPaths(): ReadonlyMap<string, string> {
        const roots = new Map<string, string>();
        for (const rootPath of [
            ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
            ...this.contextDirectories,
        ]) {
            roots.set(normalizePathForComparison(rootPath), rootPath);
        }
        return roots;
    }

    private watchPattern(pattern: vscode.GlobPattern): vscode.Disposable[] {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        return [
            watcher,
            watcher.onDidChange((uri) => this.handleFileSystemChange(uri)),
            watcher.onDidCreate((uri) => this.handleFileSystemChange(uri)),
            watcher.onDidDelete((uri) => this.handleFileSystemChange(uri)),
        ];
    }

    private handleFileSystemChange(uri: vscode.Uri): void {
        const repositoryPath = gitRepositoryPath(uri.fsPath);
        if (!repositoryPath) { return; }
        const isKnownRepository = this.contextKeys.has(normalizePathForComparison(repositoryPath));
        if (isKnownRepository && !isRepositoryDiscoveryMarkerPath(uri.fsPath) && !isRepositoryTopologyPath(uri.fsPath)) {
            return;
        }
        for (const [key, root] of this.rootWatchers) {
            this.markerAvailability.set(key, this.markerExists(root.rootPath));
        }
        this.onDidChange();
    }
}

function hasGitMarker(directoryPath: string): boolean {
    return existsSync(path.join(directoryPath, '.git'));
}

function intervalDisposable(callback: () => void, intervalMs: number): vscode.Disposable {
    const timer = setInterval(callback, intervalMs);
    return { dispose: () => clearInterval(timer) };
}

export function gitRepositoryPath(resourcePath: string): string | undefined {
    const match = [...resourcePath.matchAll(/(^|[\\/])\.git(?=$|[\\/])/g)].at(-1);
    if (!match || match.index === undefined) { return undefined; }
    const markerEnd = match.index + match[0].length;
    return path.dirname(resourcePath.slice(0, markerEnd));
}

export function isRepositoryDiscoveryMarkerPath(resourcePath: string): boolean {
    const segments = path.normalize(resourcePath).split(/[\\/]+/);
    const markerIndex = segments.lastIndexOf('.git');
    if (markerIndex === -1) { return false; }
    if (markerIndex === segments.length - 1) { return true; }
    if (markerIndex === segments.length - 2) {
        const markerFile = segments[markerIndex + 1];
        return markerFile === 'config' || markerFile === 'commondir';
    }
    return false;
}

function isRepositoryTopologyPath(resourcePath: string): boolean {
    const segments = path.normalize(resourcePath).split(/[\\/]+/);
    const markerIndex = segments.lastIndexOf('.git');
    const metadataRoot = segments[markerIndex + 1];
    return metadataRoot === 'modules' || metadataRoot === 'worktrees';
}
