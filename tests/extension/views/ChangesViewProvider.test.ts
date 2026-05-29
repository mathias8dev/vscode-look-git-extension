import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChangesViewProvider } from '../../../src/extension/views/ChangesViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import type { GitRepository } from '../../../src/core/git/GitRepository';

function makeRepo(overrides: Partial<GitRepository> = {}): GitRepository {
    return {
        cwd: '/workspace',
        exec: vi.fn(async () => ''),
        execRaw: vi.fn(async () => ''),
        getGitDir: vi.fn(async () => '/workspace/.git'),
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' as const })),
        stashList: vi.fn(async () => []),
        getStashFiles: vi.fn(async () => []),
        getLog: vi.fn(async () => []),
        getGraphLog: vi.fn(async () => []),
        getCommitFiles: vi.fn(async () => []),
        getCommitMessage: vi.fn(async () => ''),
        getAllBranches: vi.fn(async () => []),
        getAllTags: vi.fn(async () => []),
        getCurrentBranch: vi.fn(async () => 'main'),
        getUserName: vi.fn(async () => ''),
        getRemotes: vi.fn(async () => []),
        getSubmodulePaths: vi.fn(async () => new Set<string>()),
        listWorktrees: vi.fn(async () => []),
        addWorktree: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        getSubmoduleStatus: vi.fn(async () => []),
        updateSubmodule: vi.fn(async () => {}),
        updateAllSubmodules: vi.fn(async () => {}),
        stageFile: vi.fn(async () => {}),
        unstageFile: vi.fn(async () => {}),
        stageAll: vi.fn(async () => {}),
        unstageAll: vi.fn(async () => {}),
        discardFile: vi.fn(async () => {}),
        commit: vi.fn(async () => {}),
        commitAmend: vi.fn(async () => {}),
        push: vi.fn(async () => {}),
        pullAndPush: vi.fn(async () => {}),
        acceptOurs: vi.fn(async () => {}),
        acceptTheirs: vi.fn(async () => {}),
        mergeContinue: vi.fn(async () => {}),
        mergeAbort: vi.fn(async () => {}),
        rebaseContinue: vi.fn(async () => {}),
        rebaseAbort: vi.fn(async () => {}),
        stash: vi.fn(async () => {}),
        stashStaged: vi.fn(async () => {}),
        stashPop: vi.fn(async () => {}),
        stashApply: vi.fn(async () => {}),
        stashDrop: vi.fn(async () => {}),
        checkout: vi.fn(async () => {}),
        checkoutNewBranch: vi.fn(async () => {}),
        deleteBranch: vi.fn(async () => {}),
        deleteRemoteBranch: vi.fn(async () => {}),
        renameBranch: vi.fn(async () => {}),
        rebase: vi.fn(async () => {}),
        merge: vi.fn(async () => {}),
        pushBranch: vi.fn(async () => {}),
        fetchBranch: vi.fn(async () => {}),
        fetchAll: vi.fn(async () => {}),
        pull: vi.fn(async () => {}),
        ...overrides,
    };
}

describe('ChangesViewProvider', () => {
    beforeEach(resetVscodeMock);

    it('resolveWebviewView sets CSP and script tag', () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        expect(view.webview.html).toContain('Content-Security-Policy');
        expect(view.webview.html).toContain('changes.js');
        expect(view.webview.html).toMatch(/nonce-[a-f0-9]+/);
    });

    it('resolveWebviewView registers message handler', () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        expect(view.messageHandler).toBeInstanceOf(Function);
    });

    it('refresh posts statusData message', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'a.ts' }],
                unstaged: [], conflicts: [], conflictState: 'none' as const,
            })),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'changes/statusData' })));
    });

    it('ready message triggers refresh', async () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/ready' });
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalledTimes(2));
    });

    it('stageFile calls repo.stageFile and refreshes', async () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/app.ts'));
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalledTimes(2));
    });

    it('discardFile without confirmation does not call repo.discardFile', async () => {
        (vscode.window as any).warningChoice = undefined;
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/discardFile', filePath: 'src/file.ts' });
        await vi.waitFor(() => expect((vscode.window as any).warningMessages.length).toBeGreaterThan(0));
        expect(repo.discardFile).not.toHaveBeenCalled();
    });

    it('discardFile confirmed calls repo.discardFile', async () => {
        (vscode.window as any).warningChoice = 'Discard';
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/discardFile', filePath: 'src/file.ts' });
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/file.ts'));
    });

    it('commit posts commitResult success on success', async () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/commit', message: 'feat: add thing', mode: 'commit' });
        await vi.waitFor(() => expect(repo.commit).toHaveBeenCalledWith('feat: add thing'));
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'changes/commitResult', success: true })));
    });

    it('commit with empty message posts commitResult failure without calling git', async () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/commit', message: '   ', mode: 'commit' });
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'changes/commitResult', success: false })));
        expect(repo.commit).not.toHaveBeenCalled();
    });

    it('openSubmodule executes vscode.openFolder', async () => {
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        view.messageHandler?.({ type: 'changes/openSubmodule', filePath: 'modules/child' });
        await vi.waitFor(() => {
            const call = (vscode.commands as any).calls.find((c: any) => c.command === 'vscode.openFolder');
            expect(call).toBeDefined();
            expect(call.args[0].path).toContain('modules/child');
        });
    });

    it('badge updates to change count after refresh', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'new.ts' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'dirty.ts' }],
                conflicts: [],
                conflictState: 'none' as const,
            })),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view as any, {} as any, {} as any);
        await vi.waitFor(() => expect(view.badge?.value).toBe(2));
    });
});
