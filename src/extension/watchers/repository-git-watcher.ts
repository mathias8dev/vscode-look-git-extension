import * as path from 'path';
import { readFileSync, statSync } from 'node:fs';
import * as vscode from 'vscode';
import type { RepoContext } from '@core/git/domain/repo-context';
import { normalizePathForComparison } from '@extension/utils/path-compare';

const METADATA_PATTERNS = ['*', 'refs/**', 'worktrees/**', 'modules/**'] as const;

interface WatchSpec {
    readonly rootPath: string;
    readonly pattern: string;
    readonly kind: 'workingTree' | 'metadata';
}

export class RepositoryGitWatcher implements vscode.Disposable {
    private readonly watchers = new Map<string, vscode.Disposable>();

    constructor(
        private readonly onDidChange: () => void,
    ) {}

    setContexts(contexts: readonly RepoContext[]): void {
        const specs = watchSpecs(contexts);
        const nextKeys = new Set(specs.keys());
        for (const [key, disposable] of this.watchers) {
            if (nextKeys.has(key)) { continue; }
            disposable.dispose();
            this.watchers.delete(key);
        }
        for (const [key, spec] of specs) {
            if (this.watchers.has(key)) { continue; }
            this.watchers.set(key, this.watchSpec(spec));
        }
    }

    dispose(): void {
        for (const disposable of this.watchers.values()) {
            disposable.dispose();
        }
        this.watchers.clear();
    }

    private watchSpec(spec: WatchSpec): vscode.Disposable {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(spec.rootPath), spec.pattern));
        const handleChange = (uri: vscode.Uri) => {
            const accepted = spec.kind === 'workingTree'
                ? isWorkingTreeChangePath(spec.rootPath, uri.fsPath)
                : isGitMetadataChangePath(uri.fsPath);
            if (accepted) { this.onDidChange(); }
        };
        const disposables = [
            watcher,
            watcher.onDidChange(handleChange),
            watcher.onDidCreate(handleChange),
            watcher.onDidDelete(handleChange),
        ];
        return { dispose: () => disposables.forEach((disposable) => disposable.dispose()) };
    }
}

function watchSpecs(contexts: readonly RepoContext[]): ReadonlyMap<string, WatchSpec> {
    const specs = new Map<string, WatchSpec>();
    for (const context of contexts) {
        addWatchSpec(specs, { rootPath: context.cwd, pattern: '**', kind: 'workingTree' });
        for (const rootPath of resolveGitMetadataRoots(context.cwd)) {
            for (const pattern of METADATA_PATTERNS) {
                addWatchSpec(specs, { rootPath, pattern, kind: 'metadata' });
            }
        }
    }
    return specs;
}

function addWatchSpec(specs: Map<string, WatchSpec>, spec: WatchSpec): void {
    const key = [spec.kind, normalizePathForComparison(spec.rootPath), spec.pattern].join('\0');
    specs.set(key, spec);
}

export function resolveGitMetadataRoots(cwd: string): readonly string[] {
    const markerPath = path.join(cwd, '.git');
    const markerType = pathType(markerPath);
    if (!markerType) { return []; }

    const gitDir = markerType === 'directory'
        ? markerPath
        : parseGitDirFile(markerPath);
    if (!gitDir) { return []; }

    const roots = new Map<string, string>();
    roots.set(normalizePathForComparison(gitDir), gitDir);
    const commonDirFile = path.join(gitDir, 'commondir');
    const commonDirValue = pathType(commonDirFile) === 'file' ? readOptionalFile(commonDirFile) : undefined;
    if (commonDirValue?.trim()) {
        const commonDir = path.resolve(gitDir, commonDirValue.trim());
        roots.set(normalizePathForComparison(commonDir), commonDir);
    }
    return [...roots.values()];
}

function parseGitDirFile(markerPath: string): string | undefined {
    const content = readOptionalFile(markerPath);
    if (!content) { return undefined; }
    const match = /^gitdir:\s*(.+?)\s*$/im.exec(content);
    const gitDir = match?.[1];
    return gitDir ? path.resolve(path.dirname(markerPath), gitDir) : undefined;
}

function readOptionalFile(resourcePath: string): string | undefined {
    try {
        return readFileSync(resourcePath, 'utf8');
    } catch (error) {
        const code = errorCode(error);
        if (code === 'ENOENT' || code === 'ENOTDIR') { return undefined; }
        throw error;
    }
}

function pathType(resourcePath: string): 'file' | 'directory' | undefined {
    try {
        const stat = statSync(resourcePath);
        if (stat.isDirectory()) { return 'directory'; }
        if (stat.isFile()) { return 'file'; }
        return undefined;
    } catch (error) {
        const code = errorCode(error);
        if (code === 'ENOENT' || code === 'ENOTDIR') { return undefined; }
        throw error;
    }
}

function errorCode(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('code' in error)) { return undefined; }
    return typeof error.code === 'string' ? error.code : undefined;
}

export function isWorkingTreeChangePath(cwd: string, resourcePath: string): boolean {
    const relativePath = path.relative(normalizePathForComparison(cwd), normalizePathForComparison(resourcePath));
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) { return false; }
    return !relativePath.split(/[\\/]+/).includes('.git');
}

export function isGitMetadataChangePath(resourcePath: string): boolean {
    const name = path.basename(resourcePath);
    return name !== 'index.lock' && !name.startsWith('.watchman-cookie-');
}
