import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoKind } from '@core/git/domain/repo-context';
import { gitRepositoryPath, RepositoryDiscoveryWatcher, isRepositoryDiscoveryMarkerPath } from '@extension/watchers/repository-discovery-watcher';
import { RelativePattern, workspace } from '@tests/mocks/vscode';

describe('repository discovery watcher', () => {
    beforeEach(() => {
        workspace.reset();
    });

    it('matches repository marker paths that can add or remove discovered repositories', () => {
        expect(gitRepositoryPath('/workspace/app/.git/refs/heads/main')).toBe('/workspace/app');
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/config')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/commondir')).toBe(true);
        expect(isRepositoryDiscoveryMarkerPath('C:\\workspace\\app\\.git\\config')).toBe(true);
    });

    it('ignores ordinary git metadata changes that should only refresh repository data', () => {
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/HEAD')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/index')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.git/refs/heads/main')).toBe(false);
        expect(isRepositoryDiscoveryMarkerPath('/workspace/app/.gitignore')).toBe(false);
    });

    it('uses the broad workspace watcher that VS Code Git uses for repository discovery', () => {
        const onDidChange = vi.fn();
        const watcher = createDiscoveryWatcher(onDidChange);
        const workspaceWatcher = broadWorkspaceWatcher();

        expect(workspaceWatcher).toBeDefined();
        workspaceWatcher?.fireDidChange(vscode.Uri.file('/workspace/app/.git/HEAD'));
        workspaceWatcher?.fireDidCreate(vscode.Uri.file('/workspace/app/.git/config'));
        workspaceWatcher?.fireDidDelete(vscode.Uri.file('/workspace/app/.git'));
        workspaceWatcher?.fireDidCreate(vscode.Uri.file('/workspace/app/src/file.ts'));
        expect(onDidChange).toHaveBeenCalledTimes(3);

        watcher.dispose();
        workspaceWatcher?.fireDidCreate(vscode.Uri.file('/workspace/app/.git'));
        expect(onDidChange).toHaveBeenCalledTimes(3);
    });

    it('replaces recursive root watchers and requests discovery when workspace folders change', () => {
        const onDidChange = vi.fn();
        const watcher = createDiscoveryWatcher(onDidChange);

        workspace.setWorkspaceFolders(['/workspace/app']);
        const initialRootWatcher = contextWatcher('/workspace/app');
        workspace.setWorkspaceFolders(['/workspace/other']);

        expect(onDidChange).toHaveBeenCalledTimes(2);
        expect(initialRootWatcher?.disposed).toBe(true);
        expect(contextWatcher('/workspace/other')?.disposed).toBe(false);
        watcher.dispose();
    });

    it('watches registered worktree and submodule roots outside the workspace', () => {
        workspace.setWorkspaceFolders(['/workspace/app']);
        const watcher = createDiscoveryWatcher(vi.fn());

        watcher.setContexts([
            { id: 'worktree', cwd: '/checkouts/feature', kind: RepoKind.Worktree, parentId: 'main', label: 'feature' },
            { id: 'submodule', cwd: '/workspace/app/modules/lib', kind: RepoKind.Submodule, parentId: 'main', label: 'lib' },
        ]);

        const worktreeWatcher = contextWatcher('/checkouts/feature');
        const submoduleWatcher = contextWatcher('/workspace/app/modules/lib');
        expect(worktreeWatcher?.disposed).toBe(false);
        expect(submoduleWatcher?.disposed).toBe(false);

        watcher.setContexts([]);
        expect(worktreeWatcher?.disposed).toBe(true);
        expect(submoduleWatcher?.disposed).toBe(true);
        expect(contextWatcher('/workspace/app')?.disposed).toBe(false);
        watcher.dispose();
    });

    it('ignores ordinary metadata changes for known repositories but detects lifecycle and topology changes', () => {
        const onDidChange = vi.fn();
        const watcher = createDiscoveryWatcher(onDidChange);
        watcher.setContexts([
            { id: 'main', cwd: '/workspace/app', kind: RepoKind.Main, label: 'app' },
        ]);
        const workspaceWatcher = broadWorkspaceWatcher();

        workspaceWatcher?.fireDidChange(vscode.Uri.file('/workspace/app/.git/HEAD'));
        workspaceWatcher?.fireDidChange(vscode.Uri.file('/workspace/app/.git/index'));
        workspaceWatcher?.fireDidDelete(vscode.Uri.file('/workspace/app/.git'));
        workspaceWatcher?.fireDidCreate(vscode.Uri.file('/workspace/app/.git/worktrees/feature/HEAD'));
        workspaceWatcher?.fireDidCreate(vscode.Uri.file('/workspace/app/.git/modules/lib/HEAD'));

        expect(onDidChange).toHaveBeenCalledTimes(3);
        watcher.dispose();
    });

    it('reconciles repository marker changes when filesystem events are not delivered', () => {
        vi.useFakeTimers();
        workspace.setWorkspaceFolders(['/workspace/app']);
        let markerAvailable = false;
        const onDidChange = vi.fn();
        const watcher = new RepositoryDiscoveryWatcher(onDidChange, {
            markerExists: () => markerAvailable,
            markerPollIntervalMs: 50,
        });

        try {
            markerAvailable = true;
            vi.advanceTimersByTime(50);
            expect(onDidChange).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(50);
            expect(onDidChange).toHaveBeenCalledTimes(1);

            markerAvailable = false;
            vi.advanceTimersByTime(50);
            expect(onDidChange).toHaveBeenCalledTimes(2);
        } finally {
            watcher.dispose();
            vi.useRealTimers();
        }
    });

    it('detects marker recreation after a deletion event even when the creation event is missed', () => {
        vi.useFakeTimers();
        workspace.setWorkspaceFolders(['/workspace/app']);
        let markerAvailable = true;
        const onDidChange = vi.fn();
        const watcher = new RepositoryDiscoveryWatcher(onDidChange, {
            markerExists: () => markerAvailable,
            markerPollIntervalMs: 50,
        });

        try {
            markerAvailable = false;
            contextWatcher('/workspace/app')?.fireDidDelete(vscode.Uri.file('/workspace/app/.git'));
            expect(onDidChange).toHaveBeenCalledTimes(1);

            markerAvailable = true;
            vi.advanceTimersByTime(50);
            expect(onDidChange).toHaveBeenCalledTimes(2);
        } finally {
            watcher.dispose();
            vi.useRealTimers();
        }
    });
});

function broadWorkspaceWatcher() {
    return workspace.fileSystemWatchers.find((candidate) => candidate.pattern === '**');
}

function contextWatcher(rootPath: string) {
    return workspace.fileSystemWatchers.find((candidate) =>
        candidate.pattern instanceof RelativePattern
        && candidate.pattern.baseUri.fsPath === rootPath
        && candidate.pattern.pattern === '**');
}

function createDiscoveryWatcher(onDidChange: () => void): RepositoryDiscoveryWatcher {
    return new RepositoryDiscoveryWatcher(onDidChange, {
        markerExists: () => false,
        markerPollIntervalMs: 60_000,
    });
}
