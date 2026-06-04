import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { ChangesViewProvider } from '../../../src/extension/views/ChangesViewProvider';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import type { GitRepository } from '../../../src/application/ports/git-repository';
import { VscodeRemoteCommand, type RemoteCommandBackend } from '../../../src/application/ports/remote-command-backend';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { GenerateCommitMessageUseCase } from '../../../src/application/usecases/changes/generate-commit-message';
import { registerReadonlyDiffDocumentProvider } from '../../../src/extension/utils/readonly-diff-documents';
import { createSubmoduleFixture } from '../../helpers/gitRepo';
import { getCommandCalls, getInputBoxOptions, getWarningMessages, setInputBoxValue, setQuickPickValue, setWarningChoice, window as mockWindow, workspace as mockWorkspace } from '../../mocks/vscode';

function makeRepo(overrides: Partial<GitRepository> = {}): GitRepository {
    return {
        cwd: '/workspace',
        exec: vi.fn(async () => ''),
        execRaw: vi.fn(async () => ''),
        execWithEnv: vi.fn(async () => ''),
        getGitDir: vi.fn(async () => '/workspace/.git'),
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' as const })),
        stashList: vi.fn(async () => []),
        getStashFiles: vi.fn(async () => []),
        getLog: vi.fn(async () => []),
        getLogForRef: vi.fn(async () => []),
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

function makeProvider(repo: GitRepository | undefined, generateCommitMessage?: GenerateCommitMessageUseCase): ChangesViewProvider {
    return new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), async () => {}, undefined, undefined, generateCommitMessage);
}

function makeRemoteCommands(): RemoteCommandBackend {
    return {
        runVscode: vi.fn(async () => {}),
        runCli: vi.fn(async () => {}),
    };
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

function isGitUriLike(value: unknown): value is { readonly scheme: string; readonly query: string } {
    return typeof value === 'object'
        && value !== null
        && 'scheme' in value
        && 'query' in value
        && typeof value.scheme === 'string'
        && typeof value.query === 'string';
}

function gitUriQuery(value: unknown): { readonly path: string; readonly ref: string } {
    expect(isGitUriLike(value)).toBe(true);
    if (!isGitUriLike(value)) { throw new Error('Expected a git URI-like value.'); }
    expect(value.scheme).toBe('git');
    return JSON.parse(value.query) as { readonly path: string; readonly ref: string };
}

describe('ChangesViewProvider', () => {
    beforeEach(() => {
        resetVscodeMock();
        registerReadonlyDiffDocumentProvider();
    });

    it('posts configured font size updates without reloading the changes webview', () => {
        mockWorkspace.values.set('lookGit.fontSize', 22);
        const provider = makeProvider(undefined);
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        const initialHtml = view.webview.html;
        mockWorkspace.values.set('lookGit.fontSize', 24);
        view.messages = [];
        provider.notifyFontSizeChanged();

        expect(view.messages).toContainEqual({ type: 'ui/fontSizeChanged', fontSize: 24 });
        expect(view.webview.html).toBe(initialHtml);
    });

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

    it('posts refreshed status data while the retained webview is hidden', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'hidden.ts' }],
                unstaged: [], conflicts: [], conflictState: 'none' as const,
            })),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        view.visible = false;

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({
                staged: [expect.objectContaining({ filePath: 'hidden.ts' })],
            }),
        })));
    });

    it('adds semantic submodule status to submodule changes', async () => {
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'modules/lib', isSubmodule: true }],
                unstaged: [],
                conflicts: [],
                conflictState: 'none' as const,
            })),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: '+' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/statusData',
            data: expect.objectContaining({
                staged: [expect.objectContaining({
                    filePath: 'modules/lib',
                    isSubmodule: true,
                    submoduleStatus: 'out-of-sync',
                })],
            }),
        }));
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
                submodules: [],
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

    it('runs native view title commands through VS Code registrations', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockClear();

        await vscode.commands.executeCommand('lookGit.changes.openGraph');
        await vscode.commands.executeCommand('lookGit.changes.viewAsList');
        await vscode.commands.executeCommand('lookGit.changes.viewAsTreeChecked');
        await vscode.commands.executeCommand('lookGit.changes.sortByName');
        await vscode.commands.executeCommand('lookGit.changes.sortByExtensionChecked');
        await vscode.commands.executeCommand('lookGit.changes.stageAllChanges');
        await vscode.commands.executeCommand('lookGit.changes.refresh');

        expect(getCommandCalls()).toContainEqual({ command: 'lookGit.graphView.focus', args: [] });
        expect(view.messages).toContainEqual({ type: 'changes/applyViewMode', viewMode: 'list' });
        expect(view.messages).toContainEqual({ type: 'changes/applyViewMode', viewMode: 'tree' });
        expect(view.messages).toContainEqual({ type: 'changes/applySortMode', sortMode: 'name' });
        expect(view.messages).toContainEqual({ type: 'changes/applySortMode', sortMode: 'extension' });
        expect(getCommandCalls()).toContainEqual({ command: 'setContext', args: ['lookGit.changesViewMode', 'tree'] });
        expect(getCommandCalls()).toContainEqual({ command: 'setContext', args: ['lookGit.changesSortMode', 'extension'] });
        await vi.waitFor(() => expect(repo.stageAll).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('toolbar openGraph focuses the Git Graph view', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'openGraph' });

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({
            command: 'lookGit.graphView.focus',
            args: [],
        }));
    });

    it('toolbar pull push and fetch delegate to VS Code Git then refresh', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'pull' });
        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'push' });
        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'fetch' });

        await vi.waitFor(() => expect(getCommandCalls().map((call) => call.command)).toEqual(expect.arrayContaining([
            'git.pull',
            'git.push',
            'git.fetch',
        ])));
        expect(repo.pull).not.toHaveBeenCalled();
        expect(repo.push).not.toHaveBeenCalled();
        expect(repo.exec).not.toHaveBeenCalledWith(['fetch']);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
    });

    it('submodule toolbar pull push and fetch run against the selected submodule repository', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const remoteCommands = makeRemoteCommands();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), async () => {}, remoteCommands);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'pull' });
        view.messageHandler?.({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'push' });
        view.messageHandler?.({ type: 'changes/submoduleToolbarCommand', submodulePath: 'modules/lib', command: 'fetch' });

        await vi.waitFor(() => expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve('/workspace/modules/lib') }),
            VscodeRemoteCommand.Pull,
        ));
        expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve('/workspace/modules/lib') }),
            VscodeRemoteCommand.Push,
        );
        expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve('/workspace/modules/lib') }),
            VscodeRemoteCommand.Fetch,
        );
    });

    it('native submodule context commands run against the selected submodule', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const remoteCommands = makeRemoteCommands();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), async () => {}, remoteCommands);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: { kind: 'submoduleToolbar', submodulePath: 'modules/lib' },
        });
        await vscode.commands.executeCommand('lookGit.changes.submodule.fetch');

        await vi.waitFor(() => expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve('/workspace/modules/lib') }),
            VscodeRemoteCommand.Fetch,
        ));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native submodule changes commands use submodule-scoped file operations', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: { kind: 'submoduleToolbar', submodulePath: 'modules/lib' },
        });
        await vscode.commands.executeCommand('lookGit.changes.submodule.stageAllChanges');

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', path.resolve('/workspace/modules/lib'), 'add', '-A']));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native submodule commit commands focus the submodule composer', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: { kind: 'submoduleToolbar', submodulePath: 'modules/lib' },
        });
        await vscode.commands.executeCommand('lookGit.changes.submodule.commitAll');

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', path.resolve('/workspace/modules/lib'), 'add', '-A']));
        expect(view.messages).toContainEqual({
            type: 'changes/focusSubmoduleCommitComposer',
            path: 'modules/lib',
        });
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('toolbar push publishes the current branch when it has no upstream', async () => {
        const repo = makeRepo({
            getCurrentBranch: vi.fn(async () => 'topic'),
            getAllBranches: vi.fn(async () => [
                { name: 'topic', isRemote: false, isCurrent: true, hash: 'topic-head', upstream: undefined, ahead: 0, behind: 0 },
            ]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'push' });

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({ command: 'git.publish', args: [] }));
        expect(getCommandCalls()).not.toContainEqual({ command: 'git.push', args: [] });
    });

    it('toolbar fetch all delegates to VS Code Git all-remotes semantics', async () => {
        const repo = makeRepo();
        const onRepositoryUpdated = vi.fn(async () => {});
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'fetchAll' });

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({ command: 'git.fetchAll', args: [] }));
        expect(repo.fetchAll).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(onRepositoryUpdated).toHaveBeenCalledOnce());
    });

    it('toolbar checkout uses the selected branch', async () => {
        setQuickPickValue('feature/menu');
        const repo = makeRepo({
            getAllBranches: vi.fn(async () => [{
                name: 'feature/menu',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'checkout' });

        await vi.waitFor(() => expect(repo.checkout).toHaveBeenCalledWith('feature/menu'));
    });

    it('toolbar delete remote branch delegates to VS Code Git', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'deleteRemoteBranch' });

        await vi.waitFor(() => expect(getCommandCalls()).toContainEqual({ command: 'git.deleteRemoteBranch', args: [] }));
        expect(repo.deleteRemoteBranch).not.toHaveBeenCalled();
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

    it('discardAll requires a typed destructive confirmation', async () => {
        setInputBoxValue('DISCARD ALL');
        const repo = makeRepo({
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [
                    { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/a.ts' },
                    { indexStatus: ' ', workTreeStatus: 'D', filePath: 'src/b.ts' },
                ],
                conflicts: [],
                conflictState: 'none' as const,
            })),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardAll' });

        await vi.waitFor(() => expect(getInputBoxOptions().length).toBeGreaterThan(0));
        await vi.waitFor(() => expect(repo.unstageAll).toHaveBeenCalled());
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/a.ts'));
        await vi.waitFor(() => expect(repo.discardFile).toHaveBeenCalledWith('src/b.ts'));
    });

    it('discardAll cancellation leaves files untouched', async () => {
        setInputBoxValue('nope');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/discardAll' });

        await vi.waitFor(() => expect(getInputBoxOptions().length).toBeGreaterThan(0));
        expect(repo.unstageAll).not.toHaveBeenCalled();
        expect(repo.discardFile).not.toHaveBeenCalled();
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

    it('continues and aborts active merge or rebase operations inside submodules', async () => {
        setWarningChoice('Abort');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/submoduleContinueOp',
            submodulePath: 'modules/lib',
            conflictState: 'merge',
        });
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            '/workspace/modules/lib',
            '-c',
            'core.editor=true',
            'merge',
            '--continue',
        ]));

        view.messageHandler?.({
            type: 'changes/submoduleAbortOp',
            submodulePath: 'modules/lib',
            conflictState: 'rebase',
        });
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            '/workspace/modules/lib',
            'rebase',
            '--abort',
        ]));
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

    it('commit push and sync delegate remote steps to VS Code Git', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/commit', message: 'feat: push thing', mode: 'commitPush' });
        view.messageHandler?.({ type: 'changes/commit', message: 'feat: sync thing', mode: 'commitSync' });

        await vi.waitFor(() => expect(repo.commit).toHaveBeenCalledWith('feat: push thing'));
        await vi.waitFor(() => expect(repo.commit).toHaveBeenCalledWith('feat: sync thing'));
        await vi.waitFor(() => expect(getCommandCalls().map((call) => call.command)).toEqual(expect.arrayContaining([
            'git.push',
            'git.sync',
        ])));
    });

    it('commits staged changes inside a submodule', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/submoduleCommit',
            submodulePath: 'modules/lib',
            message: 'feat: inner',
            mode: 'commit',
        });

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            '/workspace/modules/lib',
            'commit',
            '-m',
            'feat: inner',
        ]));
        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/submoduleCommitResult',
            path: 'modules/lib',
            success: true,
        }));
    });

    it('submodule commit push uses an integrated terminal for the remote step', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/submoduleCommit',
            submodulePath: 'modules/lib',
            message: 'feat: inner push',
            mode: 'commitPush',
        });

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            '/workspace/modules/lib',
            'commit',
            '-m',
            'feat: inner push',
        ]));
        await vi.waitFor(() => expect(mockWindow.terminals).toContainEqual(expect.objectContaining({
            name: 'Look Git Remote: modules/lib',
            cwd: '/workspace/modules/lib',
            hideFromUser: true,
            isTransient: true,
            texts: ["git 'push'"],
            visible: false,
        })));
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

    it('generates a commit message from the active repository', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--name-status')) { return 'M\0src/app.ts\0'; }
                if (args.includes('--find-renames')) { return 'diff --git a/src/app.ts b/src/app.ts\n+new\n'; }
                return '';
            }),
            exec: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--stat')) { return ' src/app.ts | 1 +\n'; }
                if (args.includes('--pretty=format:%s')) { return 'fix(changes): old\n'; }
                return '';
            }),
        });
        const generateCommitMessage = new GenerateCommitMessageUseCase({
            generateCommitMessage: vi.fn(async () => '{"message":"fix(changes): generate message"}'),
        });
        const provider = makeProvider(repo, generateCommitMessage);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/generateCommitMessage', requestId: 'generate-1' });

        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/generatedCommitMessage',
            requestId: 'generate-1',
            message: 'fix(changes): generate message',
        }));
    });

    it('keeps the requestId when commit message generation fails', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--name-status')) { return 'M\0src/app.ts\0'; }
                if (args.includes('--find-renames')) { return 'diff --git a/src/app.ts b/src/app.ts\n+new\n'; }
                return '';
            }),
            exec: vi.fn(async (args: readonly string[]) => args.includes('--stat') ? ' src/app.ts | 1 +\n' : ''),
        });
        const generateCommitMessage = new GenerateCommitMessageUseCase({
            generateCommitMessage: vi.fn(async () => { throw new Error('No language model available'); }),
        });
        const provider = makeProvider(repo, generateCommitMessage);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/generateCommitMessage', requestId: 'generate-1' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            requestId: 'generate-1',
            message: 'No language model available',
            error: expect.objectContaining({
                code: 'languageModelFailed',
                operation: 'changes/generateCommitMessage',
            }),
        })));
    });

    it('generates a commit message from a known submodule repository', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--name-status')) { return 'M\0src/lib.ts\0'; }
                if (args.includes('--find-renames')) { return 'diff --git a/src/lib.ts b/src/lib.ts\n+new\n'; }
                return '';
            }),
            exec: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--stat')) { return ' src/lib.ts | 1 +\n'; }
                if (args.includes('--pretty=format:%s')) { return 'fix(lib): old\n'; }
                return '';
            }),
        });
        const generateCommitMessage = new GenerateCommitMessageUseCase({
            generateCommitMessage: vi.fn(async () => '{"message":"fix(lib): generate message"}'),
        });
        const provider = makeProvider(repo, generateCommitMessage);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/generateSubmoduleCommitMessage',
            requestId: 'sub-generate-1',
            submodulePath: 'modules/lib',
        });

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--cached',
            '--name-status',
            '-z',
            '--',
        ], expect.any(AbortSignal)));
        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/submoduleGeneratedCommitMessage',
            requestId: 'sub-generate-1',
            path: 'modules/lib',
            message: 'fix(lib): generate message',
        }));
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

    it('loads submodule status with raw porcelain output', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            execRaw: vi.fn(async () => ' M index.ts\0?? LOCAL_NOTES.md\0'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/getSubmoduleStatus', requestId: 'sub-1', path: 'modules/lib' });

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith(
            ['--no-optional-locks', '-C', '/workspace/modules/lib', 'status', '--porcelain', '-z', '--untracked-files=all'],
        ));
        await vi.waitFor(() => expect(view.messages).toContainEqual({
            type: 'changes/submoduleStatusData',
            requestId: 'sub-1',
            path: 'modules/lib',
            data: {
                staged: [],
                unstaged: [
                    expect.objectContaining({ filePath: 'index.ts', indexStatus: ' ', workTreeStatus: 'M' }),
                    expect.objectContaining({ filePath: 'LOCAL_NOTES.md', indexStatus: '?', workTreeStatus: '?' }),
                ],
                conflicts: [],
                conflictState: 'none',
                stashes: [],
            },
        }));
        expect(repo.exec).not.toHaveBeenCalledWith(['--no-optional-locks', '-C', '/workspace/modules/lib', 'status', '--porcelain', '-z', '--untracked-files=all']);
    });

    it('uses cached submodule paths from the parent refresh when loading submodule status', async () => {
        const repo = makeRepo({
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
            getSubmodulePaths: vi.fn(async () => { throw new Error('submodule path validation should use cache'); }),
            execRaw: vi.fn(async () => ' M index.ts\0'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({
                submodules: [expect.objectContaining({ path: 'modules/lib' })],
            }),
        })));

        view.messageHandler?.({ type: 'changes/getSubmoduleStatus', requestId: 'sub-cached', path: 'modules/lib' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/submoduleStatusData',
            requestId: 'sub-cached',
        })));
        expect(repo.getSubmodulePaths).not.toHaveBeenCalled();
    });

    it('rejects submodule status requests for unknown paths', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/getSubmoduleStatus', requestId: 'sub-escape', path: '../outside' });

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/error',
            requestId: 'sub-escape',
            message: 'Unknown submodule path: ../outside',
        })));
        expect(repo.execRaw).not.toHaveBeenCalled();
    });

    it('requires confirmation before updating all submodules', async () => {
        setWarningChoice(undefined);
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/submoduleUpdateAll' });

        await vi.waitFor(() => expect(getWarningMessages().length).toBeGreaterThan(0));
        expect(repo.updateAllSubmodules).not.toHaveBeenCalled();

        setWarningChoice('Update All');
        view.messageHandler?.({ type: 'changes/submoduleUpdateAll' });
        await vi.waitFor(() => expect(repo.updateAllSubmodules).toHaveBeenCalled());
    });

    it('opens unstaged rename diffs against the original index path', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openDiff',
            filePath: 'src/new-name.ts',
            origPath: 'src/old-name.ts',
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'R',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        const left = gitUriQuery(call?.args[0]);
        expect(left).toEqual({ path: '/workspace/src/old-name.ts', ref: '~' });
        assertUriWithPath(call?.args[1], 'src/new-name.ts');
    });

    it('opens stash rename diffs against the original stash parent path', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openStashDiff',
            index: 2,
            filePath: 'src/new-name.ts',
            origPath: 'src/old-name.ts',
            status: 'R',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expect(gitUriQuery(call?.args[0])).toEqual({ path: '/workspace/src/old-name.ts', ref: 'stash@{2}^' });
        expect(gitUriQuery(call?.args[1])).toEqual({ path: '/workspace/src/new-name.ts', ref: 'stash@{2}' });
    });

    it('opens submodule folders with an explicit window choice', async () => {
        setQuickPickValue('Open in New Window');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/child'])),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({ type: 'changes/openSubmodule', filePath: 'modules/child' });
        await vi.waitFor(() => {
            const call = getCommandCalls().find((c) => c.command === 'vscode.openFolder');
            expect(call).toBeDefined();
            const uri = call?.args[0];
            assertUriWithPath(uri, 'modules/child');
            expect(call?.args[1]).toBe(true);
        });
    });

    it('opens submodule gitlink diffs using git submodule diff output', async () => {
        const diff = [
            'diff --git a/modules/auth-kit b/modules/auth-kit',
            'index 8c253b5..52b893d 160000',
            '--- a/modules/auth-kit',
            '+++ b/modules/auth-kit',
            '@@ -1 +1 @@',
            '-Subproject commit 8c253b55f68bb7e39189a4c12a4043138b8f38fb',
            '+Subproject commit 52b893d47db993db84236fed897f463a964632f8-dirty',
            '',
        ].join('\n');
        const repo = makeRepo({
            execRaw: vi.fn(async () => diff),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openDiff',
            filePath: 'modules/auth-kit',
            isSubmodule: true,
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'M',
        });

        await vi.waitFor(() => expect(mockWindow.shownDocuments.length).toBeGreaterThan(0));
        expect(repo.execRaw).toHaveBeenCalledWith(['diff', '--submodule=short', '--', 'modules/auth-kit']);
        const document = mockWorkspace.documents.at(-1);
        expect(document?.uri?.scheme).toBe('lookgit-diff');
        expect(document?.content).toBe(diff.trimEnd());
        expect(document?.language).toBe('diff');
        expect(document?.isDirty).toBe(false);
    });

    it('opens staged submodule gitlink diffs against HEAD', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async () => 'diff --git a/modules/auth-kit b/modules/auth-kit\n'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openDiff',
            filePath: 'modules/auth-kit',
            isSubmodule: true,
            isStaged: true,
            indexStatus: 'M',
            workTreeStatus: ' ',
        });

        await vi.waitFor(() => expect(mockWindow.shownDocuments.length).toBeGreaterThan(0));
        expect(repo.execRaw).toHaveBeenCalledWith(['diff', '--submodule=short', '--cached', '--', 'modules/auth-kit']);
    });

    it.skipIf(process.platform === 'win32')('opens real submodule gitlink diffs with subproject commit lines', async () => {
        const { parent, subPath, cleanup } = createSubmoduleFixture();
        try {
            const repo = new GitProcessRepository(parent.cwd);
            const provider = makeProvider(repo);
            const view = makeWebviewView();
            provider.resolveWebviewView(view);
            parent.write(`${subPath}/extra.txt`, 'extra\n');
            parent.git(['-C', path.join(parent.cwd, subPath), 'add', '-A']);
            parent.git(['-C', path.join(parent.cwd, subPath), 'commit', '-q', '-m', 'child commit']);

            view.messageHandler?.({
                type: 'changes/openDiff',
                filePath: subPath,
                isSubmodule: true,
                isStaged: false,
                indexStatus: ' ',
                workTreeStatus: 'M',
            });

            await vi.waitFor(() => expect(mockWorkspace.documents.length).toBeGreaterThan(0));
            const document = mockWorkspace.documents.at(-1);
            expect(document?.uri?.scheme).toBe('lookgit-diff');
            expect(document?.isDirty).toBe(false);
            expect(document?.language).toBe('diff');
            expect(document?.content).toContain(`diff --git a/${subPath} b/${subPath}`);
            expect(document?.content).toContain('Subproject commit');
        } finally {
            cleanup();
        }
    });

    it('opens submodule diffs from the submodule working tree', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/child'])),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openSubmoduleDiff',
            submodulePath: 'modules/child',
            filePath: 'src/inner.ts',
            isStaged: false,
            indexStatus: ' ',
            workTreeStatus: 'M',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expect(gitUriQuery(call?.args[0])).toEqual({ path: '/workspace/modules/child/src/inner.ts', ref: '~' });
        assertUriWithPath(call?.args[1], 'modules/child/src/inner.ts');
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
