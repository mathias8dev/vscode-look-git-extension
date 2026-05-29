import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChangesViewProvider } from '../../../src/extension/views/ChangesViewProvider';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import type { GitRepository } from '../../../src/core/git/GitRepository';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { getCommandCalls, getWarningMessages, setWarningChoice } from '../../mocks/vscode';

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

function makeAccessor(repo: GitRepository | undefined): ActiveRepositoryAccessor {
    return {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository() {
            if (!repo) { throw new Error('No active Git repository.'); }
            return repo;
        },
    };
}

function makeProvider(repo: GitRepository | undefined): ChangesViewProvider {
    return new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo));
}

function makeMutableAccessor(initialRepo: GitRepository | undefined): {
    readonly accessor: ActiveRepositoryAccessor;
    setRepository(repo: GitRepository | undefined): void;
} {
    let currentRepository = initialRepo;
    return {
        accessor: {
            get currentRepository() { return currentRepository; },
            currentContext: undefined,
            requireRepository() {
                if (!currentRepository) { throw new Error('No active Git repository.'); }
                return currentRepository;
            },
        },
        setRepository(repo) { currentRepository = repo; },
    };
}

function isUriLike(value: unknown): value is { readonly path: string } {
    return typeof value === 'object'
        && value !== null
        && 'path' in value
        && typeof value.path === 'string';
}

function assertUriWithPath(value: unknown, expectedPathPart: string): void {
    expect(isUriLike(value)).toBe(true);
    if (!isUriLike(value)) { throw new Error('Expected a URI-like value with a path.'); }
    expect(value.path).toContain(expectedPathPart);
}

describe('ChangesViewProvider', () => {
    beforeEach(resetVscodeMock);

    it('resolveWebviewView sets CSP and script tag', () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        expect(view.webview.html).toContain('Content-Security-Policy');
        expect(view.webview.html).toContain('changes.js');
        expect(view.webview.html).toContain('styles.css');
        expect(view.webview.html).toContain('script-src vscode-webview:');
        expect(view.webview.html).toMatch(/<script nonce="[a-f0-9]+" type="module" src="[^"]*changes\.js"><\/script>/);
        expect(view.webview.html).toMatch(/nonce-[a-f0-9]+/);
    });

    it('resolveWebviewView registers message handler', () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        expect(view.messageHandler).toBeInstanceOf(Function);
    });

    it('refresh posts statusData message', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'a.ts' }],
                unstaged: [], conflicts: [], conflictState: 'none' as const,
            })),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'changes/statusData' })));
    });

    it('refresh failure posts a protocol error', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => { throw new Error('status failed'); }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            message: 'status failed',
            error: expect.objectContaining({
                code: 'refreshFailed',
                operation: 'changes/refresh',
            }),
        })));
    });

    it('ready message triggers refresh', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/ready' });
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalledTimes(2));
    });

    it('posts a missing repository status when no repository is active', async () => {
        const provider = makeProvider(undefined);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/statusData',
            data: {
                repositoryState: 'missing',
                staged: [],
                unstaged: [],
                conflicts: [],
                conflictState: 'none',
                stashes: [],
            },
        }));
        expect(view.badge?.value).toBe(0);
    });

    it('stageFile calls repo.stageFile and refreshes', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/app.ts'));
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalledTimes(2));
    });

    it('batch file commands call git once per file and refresh once', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/stageFiles', filePaths: ['a.ts', 'b.ts'] });
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('a.ts'));
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('b.ts'));

        view.messageHandler?.({ type: 'changes/unstageFiles', filePaths: ['c.ts', 'd.ts'] });
        await vi.waitFor(() => expect(repo.unstageFile).toHaveBeenCalledWith('c.ts'));
        await vi.waitFor(() => expect(repo.unstageFile).toHaveBeenCalledWith('d.ts'));
    });

    it('stageFile failure posts a protocol error', async () => {
        const repo = makeRepo({
            stageFile: vi.fn(async () => { throw new Error('stage failed'); }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/stageFile', filePath: 'src/app.ts' });
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            message: 'stage failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'changes/stageFile',
                recoverable: true,
            }),
        })));
    });

    it('uses the current repository from the accessor when messages arrive', async () => {
        const firstRepo = makeRepo();
        const secondRepo = makeRepo();
        const mutable = makeMutableAccessor(firstRepo);
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), mutable.accessor);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        mutable.setRepository(secondRepo);
        view.messageHandler?.({ type: 'changes/stageFile', filePath: 'src/app.ts' });

        await vi.waitFor(() => expect(secondRepo.stageFile).toHaveBeenCalledWith('src/app.ts'));
        expect(firstRepo.stageFile).not.toHaveBeenCalled();
    });

    it('discardFile without confirmation does not call repo.discardFile', async () => {
        setWarningChoice(undefined);
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardFile', filePath: 'src/file.ts' });
        await vi.waitFor(() => expect(getWarningMessages().length).toBeGreaterThan(0));
        expect(repo.discardFile).not.toHaveBeenCalled();
    });

    it('discardFile confirmed calls repo.discardFile', async () => {
        setWarningChoice('Discard');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardFile', filePath: 'src/file.ts' });
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/file.ts'));
    });

    it('discardFiles confirmed discards selected files', async () => {
        setWarningChoice('Discard');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardFiles', filePaths: ['src/a.ts', 'src/b.ts'] });
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/a.ts'));
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/b.ts'));
    });

    it('accepts conflict sides and stages the resolved file', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/acceptOurs', filePath: 'src/conflict.ts' });
        await vi.waitFor(() => expect(repo.acceptOurs).toHaveBeenCalledWith('src/conflict.ts'));
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/conflict.ts'));

        view.messageHandler?.({ type: 'changes/acceptTheirs', filePath: 'src/other.ts' });
        await vi.waitFor(() => expect(repo.acceptTheirs).toHaveBeenCalledWith('src/other.ts'));
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/other.ts'));
    });

    it('accepts incoming changes for every conflict', async () => {
        setWarningChoice('Accept All Theirs');
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [],
                conflicts: [
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/a.ts' },
                    { indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/b.ts' },
                ],
                conflictState: 'merge' as const,
            })),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/acceptAllTheirs' });

        await vi.waitFor(() => expect(repo.acceptTheirs).toHaveBeenCalledWith('src/a.ts'));
        await vi.waitFor(() => expect(repo.acceptTheirs).toHaveBeenCalledWith('src/b.ts'));
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/a.ts'));
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/b.ts'));
    });

    it('routes batch conflict commands to each selected file', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/acceptOursFiles', filePaths: ['src/a.ts', 'src/b.ts'] });
        await vi.waitFor(() => expect(repo.acceptOurs).toHaveBeenCalledWith('src/a.ts'));
        await vi.waitFor(() => expect(repo.acceptOurs).toHaveBeenCalledWith('src/b.ts'));

        view.messageHandler?.({ type: 'changes/acceptTheirsFiles', filePaths: ['src/c.ts'] });
        await vi.waitFor(() => expect(repo.acceptTheirs).toHaveBeenCalledWith('src/c.ts'));

        view.messageHandler?.({ type: 'changes/markResolvedFiles', filePaths: ['src/d.ts'] });
        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/d.ts'));
    });

    it('continues and aborts active merge or rebase operations', async () => {
        setWarningChoice('Abort');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/continueOp', conflictState: 'merge' });
        await vi.waitFor(() => expect(repo.mergeContinue).toHaveBeenCalled());

        view.messageHandler?.({ type: 'changes/abortOp', conflictState: 'rebase' });
        await vi.waitFor(() => expect(repo.rebaseAbort).toHaveBeenCalled());
    });

    it('routes stash commands to the active repository', async () => {
        setWarningChoice('Drop');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/stash', message: 'save all' });
        await vi.waitFor(() => expect(repo.stash).toHaveBeenCalledWith('save all'));

        view.messageHandler?.({ type: 'changes/stashStaged', message: 'save staged' });
        await vi.waitFor(() => expect(repo.stashStaged).toHaveBeenCalledWith('save staged'));

        view.messageHandler?.({ type: 'changes/stashApply', index: 1 });
        await vi.waitFor(() => expect(repo.stashApply).toHaveBeenCalledWith(1));

        view.messageHandler?.({ type: 'changes/stashPop', index: 2 });
        await vi.waitFor(() => expect(repo.stashPop).toHaveBeenCalledWith(2));

        view.messageHandler?.({ type: 'changes/stashDrop', index: 3 });
        await vi.waitFor(() => expect(repo.stashDrop).toHaveBeenCalledWith(3));
    });

    it('commit posts commitResult success on success', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/commit', message: 'feat: add thing', mode: 'commit' });
        await vi.waitFor(() => expect(repo.commit).toHaveBeenCalledWith('feat: add thing'));
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({ type: 'changes/commitResult', success: true })));
    });

    it('commit with empty message posts commitResult failure without calling git', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/commit', message: '   ', mode: 'commit' });
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/commitResult',
            success: false,
            message: 'Commit message cannot be empty.',
            error: expect.objectContaining({
                code: 'validationFailed',
                operation: 'changes/commit',
            }),
        })));
        expect(repo.commit).not.toHaveBeenCalled();
    });

    it('commit failure posts commitResult with a protocol error', async () => {
        const repo = makeRepo({
            commit: vi.fn(async () => { throw new Error('commit failed'); }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/commit', message: 'feat: fail', mode: 'commit' });
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/commitResult',
            success: false,
            message: 'commit failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'changes/commit',
            }),
        })));
    });

    it('keeps the requestId when loading stash files fails', async () => {
        const repo = makeRepo({
            getStashFiles: vi.fn(async () => { throw new Error('stash failed'); }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/getStashFiles', requestId: 'stash-1', index: 0 });
        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            requestId: 'stash-1',
            message: 'stash failed',
            error: expect.objectContaining({
                code: 'gitOperationFailed',
                operation: 'changes/getStashFiles',
            }),
        })));
    });

    it('openSubmodule executes vscode.openFolder', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/openSubmodule', filePath: 'modules/child' });
        await vi.waitFor(() => {
            const call = getCommandCalls().find((c) => c.command === 'vscode.openFolder');
            expect(call).toBeDefined();
            const uri = call?.args[0];
            assertUriWithPath(uri, 'modules/child');
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
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(view.badge?.value).toBe(2));
    });
});
