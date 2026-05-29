import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { Repository } from '../types/git';
import { GitProcessRepository } from './git/GitProcessRepository';
import { ChangesViewProvider } from './views/ChangesViewProvider';
import { GraphViewProvider } from './views/GraphViewProvider';
import { getBuiltInGitApi } from './utils/gitExtension';
import type { SerializedRepoContext } from '../protocol/shared/repo';

function makeContext(repo: GitProcessRepository): SerializedRepoContext {
    return {
        id: crypto.createHash('sha256').update(repo.cwd).digest('hex').substring(0, 16),
        cwd: repo.cwd,
        kind: 'main',
        label: repo.cwd.split('/').pop() ?? repo.cwd,
    };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const gitApi = await getBuiltInGitApi();
    if (!gitApi) { return; }

    // Track per-repo disposables
    const repoDisposables = new Map<string, vscode.Disposable[]>();

    // Active git service — updated when active repo changes
    const getActiveVsRepo = (): Repository | undefined =>
        gitApi.repositories.find((r) => r.ui.selected) ?? gitApi.repositories[0];

    let activeRepo: GitProcessRepository | undefined;

    // Register views
    const changesProvider = new ChangesViewProvider(context.extensionUri, new GitProcessRepository(''));
    const graphProvider = new GraphViewProvider(context.extensionUri, new GitProcessRepository(''));

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChangesViewProvider.viewType, changesProvider, { webviewOptions: { retainContextWhenHidden: true } }),
        vscode.window.registerWebviewViewProvider(GraphViewProvider.viewType, graphProvider, { webviewOptions: { retainContextWhenHidden: true } }),
    );

    // Update active repo and notify providers
    const DEBOUNCE_MS = 150;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    function debouncedRefreshAll(): void {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            void changesProvider.refresh();
            void graphProvider.notifyRepoChanged(makeContext(activeRepo!));
        }, DEBOUNCE_MS);
    }

    function useActiveRepo(): void {
        const vsRepo = getActiveVsRepo();
        const cwd = vsRepo?.rootUri.fsPath ?? '';
        if (!cwd) { return; }

        activeRepo = new GitProcessRepository(cwd);
        // Patch providers with new repo (internal setter — accessed via prototype)
        (changesProvider as any).repo = activeRepo;
        (graphProvider as any).repo = activeRepo;

        void vscode.commands.executeCommand('setContext', 'lookGit.hasRepository', true);
        void changesProvider.notifyRepoChanged(makeContext(activeRepo));
        void graphProvider.notifyRepoChanged(makeContext(activeRepo));
    }

    // Wire per-repo state watchers
    function watchRepo(repo: Repository): void {
        const key = repo.rootUri.fsPath;
        const disposables: vscode.Disposable[] = [
            repo.state.onDidChange(() => debouncedRefreshAll()),
            repo.ui.onDidChange(() => useActiveRepo()),
        ];
        repoDisposables.set(key, disposables);
    }

    for (const repo of gitApi.repositories) { watchRepo(repo); }

    context.subscriptions.push(
        gitApi.onDidOpenRepository((repo) => { watchRepo(repo); useActiveRepo(); }),
        gitApi.onDidCloseRepository((repo) => {
            const key = repo.rootUri.fsPath;
            repoDisposables.get(key)?.forEach((d) => d.dispose());
            repoDisposables.delete(key);
            useActiveRepo();
        }),
    );

    // File watchers for git metadata (including worktrees)
    const gitMetadataPatterns = [
        '**/.git/HEAD', '**/.git/index',
        '**/.git/MERGE_HEAD', '**/.git/REBASE_HEAD',
        '**/.git/CHERRY_PICK_HEAD', '**/.git/FETCH_HEAD',
        '**/.git/packed-refs', '**/.git/refs/**',
        '**/.git/worktrees/*/HEAD', '**/.git/worktrees/*/gitdir',
    ];
    for (const pattern of gitMetadataPatterns) {
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        context.subscriptions.push(
            watcher,
            watcher.onDidChange(debouncedRefreshAll),
            watcher.onDidCreate(debouncedRefreshAll),
            watcher.onDidDelete(debouncedRefreshAll),
        );
    }

    useActiveRepo();
}

export function deactivate(): void {}
