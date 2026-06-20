import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as path from 'path';
import { ChangesViewProvider } from '../../../src/extension/views/ChangesViewProvider';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { makeWebviewView, resetVscodeMock } from '../../helpers/providerRuntime';
import type { GitRepository } from '../../../src/application/ports/git-repository';
import type { GitRepository as RuntimeRepository, Worktree } from '../../../src/application/ports/git-topology';
import type { GitRuntime } from '../../../src/application/ports/git-runtime';
import { VscodeRemoteCommand, type RemoteCommandBackend } from '../../../src/application/ports/remote-command-backend';
import { OperationStatus } from '../../../src/protocol/shared/operation';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { RepositoryRegistry } from '../../../src/extension/repositories/RepositoryRegistry';
import { RepoKind, type RepoContext } from '../../../src/core/git/domain/RepoContext';
import { Page } from '../../../src/core/git/domain/Page';
import { GenerateCommitMessageUseCase } from '../../../src/application/usecases/changes/generate-commit-message';
import { ExplainSelectedChangesUseCase } from '../../../src/application/usecases/changes/explain-selected-changes';
import { registerReadonlyDiffDocumentProvider } from '../../../src/extension/utils/readonly-diff-documents';
import { createConflictWorkflowFixture, createSubmoduleFixture, createTempGitRepo } from '../../helpers/gitRepo';
import { env, getCommandCalls, getInputBoxOptions, getWarningMessages, setErrorChoice, setInputBoxValue, setQuickPickValue, setQuickPickValues, setWarningChoice, window as mockWindow, workspace as mockWorkspace } from '../../mocks/vscode';

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
        getLogForPath: vi.fn(async () => []),
        getLogForRef: vi.fn(async () => []),
        getLogForRefAndPath: vi.fn(async () => []),
        getLogForLineRange: vi.fn(async () => []),
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

function makeAccessorWithContext(repo: GitRepository | undefined, context: RepoContext | undefined): ActiveRepositoryAccessor {
    return {
        currentRepository: repo,
        currentContext: context,
        requireRepository() {
            if (!repo) { throw new Error('No active Git repository.'); }
            return repo;
        },
    };
}

function makeProvider(
    repo: GitRepository | undefined,
    generateCommitMessage?: GenerateCommitMessageUseCase,
    explainSelectedChanges?: ExplainSelectedChangesUseCase,
): ChangesViewProvider {
    return new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), async () => {}, undefined, undefined, generateCommitMessage, undefined, undefined, explainSelectedChanges);
}

function makeRemoteCommands(): RemoteCommandBackend {
    return {
        runVscode: vi.fn(async () => {}),
        runCli: vi.fn(async () => {}),
    };
}

const runtime = {
    supports: () => false,
    execute: async () => undefined,
} satisfies GitRuntime;

function runtimeRepository(overrides: Partial<RuntimeRepository> = {}): RuntimeRepository {
    return {
        repoId: 'repo',
        gitDir: '/workspace/.git',
        kind: 'main',
        label: 'workspace',
        runtime,
        listBranches: vi.fn(async () => []),
        listRemoteBranches: vi.fn(async () => []),
        listTags: vi.fn(async () => []),
        listRemotes: vi.fn(async () => []),
        resolveRef: vi.fn(async () => ''),
        listSubmodules: vi.fn(async () => []),
        getSubmoduleStatus: vi.fn(async () => ({ path: '', status: ' ' })),
        initSubmodule: vi.fn(async () => {}),
        updateSubmodule: vi.fn(async () => {}),
        syncSubmodule: vi.fn(async () => {}),
        fetchSubmodule: vi.fn(async () => {}),
        deinitSubmodule: vi.fn(async () => {}),
        openSubmoduleRepository: vi.fn(async () => ''),
        ...overrides,
    } as RuntimeRepository;
}

function runtimeWorktree(overrides: Partial<Worktree> = {}): Worktree {
    return {
        repoId: 'repo',
        worktreeId: 'repo',
        path: '/workspace',
        isMain: true,
        head: 'abc123',
        dirty: false,
        runtime,
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' })),
        getUntrackedFiles: vi.fn(async () => new Page([], false)),
        getIgnoredFiles: vi.fn(async () => new Page([], false)),
        listStashes: vi.fn(async () => new Page([], false)),
        stash: vi.fn(async () => {}),
        applyStash: vi.fn(async () => {}),
        popStash: vi.fn(async () => {}),
        dropStash: vi.fn(async () => {}),
        clearStashes: vi.fn(async () => {}),
        branchFromStash: vi.fn(async () => {}),
        ...overrides,
    } as Worktree;
}

function conflictStageExecRaw(expectedCwd?: string, conflictPaths: readonly string[] = ['src/conflict.ts']): GitRepository['execRaw'] {
    return vi.fn(async (args: readonly string[]) => {
        const effectiveArgs = args[0] === '-C' ? args.slice(2) : args;
        if (expectedCwd) {
            expect(args.slice(0, 2)).toEqual(['-C', expectedCwd]);
        }
        if (effectiveArgs[0] === 'status') {
            return conflictPaths.map((filePath) => `UU ${filePath}`).join('\0') + '\0';
        }
        if (effectiveArgs[0] === 'submodule') {
            return '';
        }
        if (effectiveArgs[0] === 'ls-files') {
            const filePath = effectiveArgs.at(-1) ?? conflictPaths[0] ?? 'src/conflict.ts';
            return [
                `100644 ${'1'.repeat(40)} 1\t${filePath}`,
                `100644 ${'2'.repeat(40)} 2\t${filePath}`,
                `100644 ${'3'.repeat(40)} 3\t${filePath}`,
                '',
            ].join('\0');
        }
        if (effectiveArgs[0] === 'cat-file') {
            return `content ${effectiveArgs[2] ?? ''}\n`;
        }
        return '';
    });
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

interface MergeEditorOpenArgs {
    readonly base: { readonly scheme: string; readonly path: string };
    readonly input1: { readonly title: string; readonly uri: { readonly scheme: string; readonly path: string } };
    readonly input2: { readonly title: string; readonly uri: { readonly scheme: string; readonly path: string } };
    readonly output: { readonly scheme: string; readonly path: string };
}

function isMergeEditorOpenArgs(value: unknown): value is MergeEditorOpenArgs {
    return typeof value === 'object'
        && value !== null
        && 'base' in value
        && 'input1' in value
        && 'input2' in value
        && 'output' in value;
}

function mergeEditorOpenArgs(value: unknown): MergeEditorOpenArgs {
    expect(isMergeEditorOpenArgs(value)).toBe(true);
    if (!isMergeEditorOpenArgs(value)) { throw new Error('Expected merge editor open args.'); }
    return value;
}

function isSchemeUriLike(value: unknown): value is { readonly scheme: string; readonly path: string } {
    return typeof value === 'object'
        && value !== null
        && 'scheme' in value
        && typeof value.scheme === 'string'
        && 'path' in value
        && typeof value.path === 'string';
}

function expectReadonlyUri(value: unknown, expectedPathPart?: string): void {
    expect(isSchemeUriLike(value)).toBe(true);
    if (!isSchemeUriLike(value)) { throw new Error('Expected a URI-like value.'); }
    expect(value.scheme).toBe('lookgit-diff');
    if (expectedPathPart) {
        expect(value.path).toContain(expectedPathPart);
    }
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

    it('refresh uses runtime repository registry when current context is available', async () => {
        const context = {
            id: 'repo',
            cwd: '/workspace',
            kind: RepoKind.Main,
            label: 'workspace',
        } satisfies RepoContext;
        const repo = makeRepo({
            getStatus: vi.fn(async () => { throw new Error('legacy status should not run'); }),
        });
        const runtimeRegistry = new RepositoryRegistry();
        runtimeRegistry.registerRepository(runtimeRepository({
            listSubmodules: vi.fn(async () => [{ path: 'modules/runtime', status: '+' }]),
            listBranches: vi.fn(async () => [
                { name: 'runtime-branch', isRemote: false, isCurrent: true, hash: 'abc123', ahead: 0, behind: 0 },
            ]),
        }));
        runtimeRegistry.registerWorktree(runtimeWorktree({
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'runtime.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: 'none' as const,
            })),
            listStashes: vi.fn(async () => new Page([{ index: 0, message: 'runtime stash' }], false)),
        }));
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/ext'),
            makeAccessorWithContext(repo, context),
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);

        await vi.waitFor(() => expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/statusData',
            data: expect.objectContaining({
                staged: [expect.objectContaining({ filePath: 'runtime.ts' })],
                stashes: [expect.objectContaining({ message: 'runtime stash' })],
                currentBranch: 'runtime-branch',
            }),
        })));
        expect(repo.getStatus).not.toHaveBeenCalled();
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
        expect(getCommandCalls()).toContainEqual({ command: 'setContext', args: ['lookGit.changesViewMode', 'list'] });
        expect(getCommandCalls()).toContainEqual({ command: 'setContext', args: ['lookGit.changesViewAsTree', false] });
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

    it('native apply patch command applies clipboard patch to the working tree', async () => {
        setQuickPickValues(['From Clipboard', 'Apply to Working Tree']);
        env.clipboard.value = 'diff --git a/src/app.ts b/src/app.ts\n';
        const onRepositoryUpdated = vi.fn(async () => {});
        const repo = makeRepo();
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockClear();

        await vscode.commands.executeCommand('lookGit.changes.applyPatch');

        expect(repo.exec).toHaveBeenNthCalledWith(1, ['apply', '--check', '--3way', expect.any(String)]);
        expect(repo.exec).toHaveBeenNthCalledWith(2, ['apply', '--3way', expect.any(String)]);
        await vi.waitFor(() => expect(mockWindow.infoMessages).toContain('Patch applied.'));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Running,
            command: 'applyPatch',
        }));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Success,
            command: 'applyPatch',
        }));
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native apply patch command reads a patch file and applies it staged', async () => {
        setQuickPickValues(['From File...', 'Apply and Stage']);
        const patchUri = vscode.Uri.file('/workspace/fix.patch');
        mockWindow.openDialogValue = [patchUri];
        mockWorkspace.fs.files.set('/workspace/fix.patch', new TextEncoder().encode('diff --git a/a.ts b/a.ts\n'));
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());

        await vscode.commands.executeCommand('lookGit.changes.applyPatch');

        expect(repo.exec).toHaveBeenNthCalledWith(1, ['apply', '--check', '--3way', '--index', expect.any(String)]);
        expect(repo.exec).toHaveBeenNthCalledWith(2, ['apply', '--3way', '--index', expect.any(String)]);
        await vi.waitFor(() => expect(mockWindow.infoMessages).toContain('Patch applied and staged.'));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native apply patch command reports conflicts with an open-all action', async () => {
        setQuickPickValues(['From Clipboard', 'Apply to Working Tree']);
        setWarningChoice('Open All in Merge Editor');
        env.clipboard.value = 'diff --git a/src/app.ts b/src/app.ts\n';
        const onRepositoryUpdated = vi.fn(async () => {});
        const repo = makeRepo({
            execRaw: conflictStageExecRaw(undefined, ['src/app.ts']),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockReset();
        vi.mocked(repo.getStatus).mockResolvedValue({
            staged: [],
            unstaged: [],
            conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/app.ts' }],
            conflictState: 'none' as const,
        });

        await vscode.commands.executeCommand('lookGit.changes.applyPatch');

        await vi.waitFor(() => expect(mockWindow.warningMessages.some((entry) => entry.message === 'Patch applied with conflicts. 1 unresolved conflict.')).toBe(true));
        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Conflict,
            command: 'applyPatch',
        }));
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native apply patch command stops on failed preflight and offers output details', async () => {
        setQuickPickValues(['From Clipboard', 'Apply to Working Tree']);
        setErrorChoice('Show Output');
        env.clipboard.value = 'diff --git a/src/app.ts b/src/app.ts\n';
        const failure = Object.assign(new Error('Command failed: git apply --check'), {
            stderr: 'error: patch failed: src/app.ts:1',
        });
        const repo = makeRepo({
            exec: vi.fn(async () => {
                throw failure;
            }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();

        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockClear();

        await vscode.commands.executeCommand('lookGit.changes.applyPatch');

        expect(repo.exec).toHaveBeenCalledOnce();
        expect(repo.getStatus).not.toHaveBeenCalled();
        expect(mockWindow.errorMessages).toContain('Patch could not be applied.');
        expect(mockWindow.outputChannels[0]?.shown).toBe(true);
        expect(mockWindow.outputChannels[0]?.lines.join('\n')).toContain('error: patch failed: src/app.ts:1');
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

    it('toolbar pull conflicts refresh dependent views and show an actionable notification', async () => {
        setWarningChoice('Open All in Merge Editor');
        const onRepositoryUpdated = vi.fn(async () => {});
        const remoteCommands = makeRemoteCommands();
        vi.mocked(remoteCommands.runVscode).mockRejectedValue(new Error('Automatic merge failed; fix conflicts and then commit the result.'));
        const repo = makeRepo({
            execRaw: conflictStageExecRaw(undefined, ['src/conflict.ts']),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), onRepositoryUpdated, remoteCommands);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockReset();
        vi.mocked(repo.getStatus)
            .mockResolvedValueOnce({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' as const })
            .mockResolvedValue({
                staged: [],
                unstaged: [],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: 'merge' as const,
            });

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'pull' });

        await vi.waitFor(() => expect(remoteCommands.runVscode).toHaveBeenCalledWith(repo, VscodeRemoteCommand.Pull));
        await vi.waitFor(() => expect(mockWindow.warningMessages.some((entry) => entry.message === 'Pull stopped with conflicts. 1 unresolved conflict.')).toBe(true));
        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Running,
            command: 'pull',
        }));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Conflict,
            command: 'pull',
        }));
        expect(view.messages).not.toContainEqual(expect.objectContaining({ type: 'changes/error' }));
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
    });

    it('toolbar merge conflicts are treated as an actionable repository state', async () => {
        setQuickPickValue('feature/conflict');
        setWarningChoice('Open All in Merge Editor');
        const onRepositoryUpdated = vi.fn(async () => {});
        const repo = makeRepo({
            execRaw: conflictStageExecRaw(undefined, ['src/conflict.ts']),
            getAllBranches: vi.fn(async () => [{
                name: 'feature/conflict',
                isRemote: false,
                isCurrent: false,
                hash: 'feature123',
                ahead: 0,
                behind: 0,
            }]),
            merge: vi.fn(async () => { throw new Error('Automatic merge failed; fix conflicts and then commit the result.'); }),
        });
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext'), makeAccessor(repo), onRepositoryUpdated);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        await vi.waitFor(() => expect(repo.getStatus).toHaveBeenCalled());
        vi.mocked(repo.getStatus).mockReset();
        vi.mocked(repo.getStatus)
            .mockResolvedValueOnce({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' as const })
            .mockResolvedValue({
                staged: [],
                unstaged: [],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
                conflictState: 'merge' as const,
            });

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'mergeBranch' });

        await vi.waitFor(() => expect(repo.merge).toHaveBeenCalledWith('feature/conflict'));
        await vi.waitFor(() => expect(mockWindow.warningMessages.some((entry) => entry.message === 'Merge stopped with conflicts. 1 unresolved conflict.')).toBe(true));
        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
        expect(view.messages).toContainEqual(expect.objectContaining({
            type: 'changes/operationStatus',
            status: OperationStatus.Conflict,
            command: 'mergeBranch',
        }));
        expect(view.messages).not.toContainEqual(expect.objectContaining({ type: 'changes/error' }));
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
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
            expect.objectContaining({ cwd: path.resolve(repo.cwd, 'modules/lib') }),
            VscodeRemoteCommand.Pull,
        ));
        expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve(repo.cwd, 'modules/lib') }),
            VscodeRemoteCommand.Push,
        );
        expect(remoteCommands.runVscode).toHaveBeenCalledWith(
            expect.objectContaining({ cwd: path.resolve(repo.cwd, 'modules/lib') }),
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
            expect.objectContaining({ cwd: path.resolve(repo.cwd, 'modules/lib') }),
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

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', path.join(repo.cwd, 'modules/lib'), 'add', '-A']));
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

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', path.join(repo.cwd, 'modules/lib'), 'add', '-A']));
        expect(view.messages).toContainEqual({
            type: 'changes/focusSubmoduleCommitComposer',
            path: 'modules/lib',
        });
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native commit composer commands submit the captured active repository message', async () => {
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: { kind: 'commitComposer', message: '  fix(changes): amend from native menu  ' },
        });
        await vscode.commands.executeCommand('lookGit.changes.commitComposer.amend');

        await vi.waitFor(() => expect(repo.commitAmend).toHaveBeenCalledWith('fix(changes): amend from native menu'));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native commit composer commands submit the captured submodule message', async () => {
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
            target: {
                kind: 'commitComposer',
                submodulePath: 'modules/lib',
                message: 'feat(lib): commit from native menu',
            },
        });
        await vscode.commands.executeCommand('lookGit.changes.commitComposer.commitPush');

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            path.join(repo.cwd, 'modules/lib'),
            'commit',
            '-m',
            'feat(lib): commit from native menu',
        ]));
        expect(remoteCommands.runCli).toHaveBeenCalledWith(repo, expect.objectContaining({
            cwd: path.join(repo.cwd, 'modules/lib'),
            args: ['push'],
        }));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection commands stage unstage and discard selected changes', async () => {
        setWarningChoice('Discard');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/a.ts', 'src/staged.ts'],
                stageFilePaths: ['src/a.ts'],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: ['src/a.ts'],
                stashFilePaths: ['src/a.ts', 'src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: ['src/a.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.stage');
        await vscode.commands.executeCommand('lookGit.changes.selection.unstage');
        await vscode.commands.executeCommand('lookGit.changes.selection.discard');

        await vi.waitFor(() => expect(repo.stageFile).toHaveBeenCalledWith('src/a.ts'));
        expect(repo.unstageFile).toHaveBeenCalledWith('src/staged.ts');
        expect(repo.discardFile).toHaveBeenCalledWith('src/a.ts');
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection stash command stashes selected pathspecs', async () => {
        setInputBoxValue('save selected');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/a.ts', 'src/new.ts'],
                stageFilePaths: ['src/a.ts', 'src/new.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/a.ts', 'src/new.ts'],
                stashFilePaths: ['src/a.ts', 'src/new.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/a.ts'],
                patchUntrackedFilePaths: ['src/new.ts'],
                stashIncludeUntracked: true,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.stash');

        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            'stash',
            'push',
            '--include-untracked',
            '-m',
            'save selected',
            '--',
            'src/a.ts',
            'src/new.ts',
        ]));
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection create patch command exports selected changes', async () => {
        setQuickPickValue('Copy Patch to Clipboard');
        const repo = makeRepo({
            execRaw: vi.fn(async (args) => args.includes('--cached') ? 'staged patch\n' : 'unstaged patch\n'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/app.ts', 'src/staged.ts'],
                stageFilePaths: ['src/app.ts'],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: ['src/app.ts'],
                stashFilePaths: ['src/app.ts', 'src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.createPatch');

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['diff', '--cached', '--binary', '--', 'src/staged.ts']));
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['diff', '--binary', '--', 'src/app.ts']);
        expect(mockWindow.infoMessages).toContain('Patch copied to clipboard.');
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection explain diff command opens a markdown explanation', async () => {
        const explainDiff = vi.fn(async () => '## Summary\nChanged the selected files.');
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => args.includes('--cached')
                ? 'diff --git a/src/staged.ts b/src/staged.ts\n+staged\n'
                : 'diff --git a/src/app.ts b/src/app.ts\n+unstaged\n'),
        });
        const provider = makeProvider(repo, undefined, new ExplainSelectedChangesUseCase({ explainDiff }));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/app.ts', 'src/staged.ts'],
                stageFilePaths: ['src/app.ts'],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: ['src/app.ts'],
                stashFilePaths: ['src/app.ts', 'src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.explainDiff');

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenNthCalledWith(1, [
            'diff',
            '--cached',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/staged.ts',
        ], expect.any(AbortSignal)));
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, [
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/app.ts',
        ], expect.any(AbortSignal));
        expect(explainDiff).toHaveBeenCalledWith(expect.objectContaining({
            selectedItems: ['staged: src/staged.ts', 'unstaged: src/app.ts'],
        }), expect.any(AbortSignal));
        expect(mockWorkspace.documents.at(-1)).toEqual(expect.objectContaining({
            language: 'markdown',
            content: expect.stringContaining('Changed the selected files.'),
        }));
        expect(mockWindow.shownDocuments).toHaveLength(1);
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('webview section review message opens a markdown explanation for patchable changes', async () => {
        const explainDiff = vi.fn(async () => 'Reviewed the section.');
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => args.includes('--cached')
                ? 'diff --git a/src/staged.ts b/src/staged.ts\n+staged\n'
                : 'diff --git a/src/app.ts b/src/app.ts\n+app\n'),
        });
        const provider = makeProvider(repo, undefined, new ExplainSelectedChangesUseCase({ explainDiff }));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/explainSelection',
            target: {
                kind: 'selection',
                filePaths: ['src/staged.ts', 'src/app.ts'],
                stageFilePaths: [],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: [],
                stashFilePaths: ['src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            'diff',
            '--cached',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/staged.ts',
        ], expect.any(AbortSignal)));
        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/app.ts',
        ], expect.any(AbortSignal)));
        expect(explainDiff).toHaveBeenCalledWith(expect.objectContaining({
            selectedItems: ['staged: src/staged.ts', 'unstaged: src/app.ts'],
        }), expect.any(AbortSignal));
        expect(mockWorkspace.documents.at(-1)).toEqual(expect.objectContaining({
            language: 'markdown',
            content: expect.stringContaining('Reviewed the section.'),
        }));
    });

    it('native selection explain diff command runs inside selected submodule changes', async () => {
        const explainDiff = vi.fn(async () => 'Submodule change explained.');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            execRaw: vi.fn(async () => 'diff --git a/src/lib.ts b/src/lib.ts\n+lib\n'),
        });
        const provider = makeProvider(repo, undefined, new ExplainSelectedChangesUseCase({ explainDiff }));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                submodulePath: 'modules/lib',
                filePaths: ['src/lib.ts'],
                stageFilePaths: ['src/lib.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/lib.ts'],
                stashFilePaths: ['src/lib.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/lib.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.explainDiff');

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/lib.ts',
        ], expect.any(AbortSignal)));
        expect(mockWorkspace.documents.at(-1)).toEqual(expect.objectContaining({
            content: expect.stringContaining('Submodule: `modules/lib`'),
        }));
        expect(mockWindow.shownDocuments).toHaveLength(1);
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('webview submodule review message reviews the current submodule status', async () => {
        const explainDiff = vi.fn(async () => 'Reviewed submodule changes.');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('submodule')) { return ''; }
                if (args.includes('status')) { return 'M  src/staged.ts\0 M src/inner.ts\0UU src/conflict.ts\0'; }
                if (args.includes('--cached')) { return 'diff --git a/src/staged.ts b/src/staged.ts\n+staged\n'; }
                return 'diff --git a/src/inner.ts b/src/inner.ts\n+inner\n';
            }),
        });
        const provider = makeProvider(repo, undefined, new ExplainSelectedChangesUseCase({ explainDiff }));
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/explainRepositoryChanges', submodulePath: 'modules/lib' });

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'status',
            '--porcelain=v1',
            '-z',
            '-u',
        ], expect.any(AbortSignal)));
        expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--cached',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/staged.ts',
        ], expect.any(AbortSignal));
        expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/inner.ts',
        ], expect.any(AbortSignal));
        expect(repo.execRaw).not.toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'src/conflict.ts',
        ], expect.any(AbortSignal));
        expect(mockWorkspace.documents.at(-1)).toEqual(expect.objectContaining({
            content: expect.stringContaining('Submodule: `modules/lib`'),
        }));
        expect(mockWorkspace.documents.at(-1)).toEqual(expect.objectContaining({
            content: expect.stringContaining('Reviewed submodule changes.'),
        }));
    });

    it('native selection explain diff command reports language model failures in VS Code', async () => {
        setErrorChoice('Show Output');
        const repo = makeRepo({
            execRaw: vi.fn(async () => 'diff --git a/src/app.ts b/src/app.ts\n+app\n'),
        });
        const provider = makeProvider(repo, undefined, new ExplainSelectedChangesUseCase({
            explainDiff: vi.fn(async () => { throw new Error('No language model available'); }),
        }));
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/app.ts'],
                stageFilePaths: ['src/app.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/app.ts'],
                stashFilePaths: ['src/app.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.explainDiff');

        expect(mockWindow.errorMessages).toContain('Could not explain selected diff.');
        expect(mockWindow.outputChannels.at(-1)).toEqual(expect.objectContaining({
            name: 'Look Git',
            shown: true,
            lines: expect.arrayContaining(['Diff explanation failed.', 'No language model available']),
        }));
        expect(mockWindow.shownDocuments).toHaveLength(0);
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection create patch command runs inside selected submodule changes', async () => {
        setQuickPickValue('Copy Patch to Clipboard');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            execRaw: vi.fn(async () => 'submodule staged patch\n'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                submodulePath: 'modules/lib',
                filePaths: ['src/staged.ts'],
                stageFilePaths: [],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: [],
                stashFilePaths: ['src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: [],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: false,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.createPatch');

        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith([
            '-C',
            'modules/lib',
            'diff',
            '--cached',
            '--binary',
            '--',
            'src/staged.ts',
        ], undefined));
        expect(mockWindow.infoMessages).toContain('Patch copied to clipboard.');
        disposables.forEach((disposable) => disposable.dispose());
    });

    it('native selection commands run against selected submodule changes', async () => {
        setWarningChoice('Discard');
        setInputBoxValue('save inner');
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        const disposables = provider.registerNativeContextCommands();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                submodulePath: 'modules/lib',
                filePaths: ['src/app.ts', 'src/staged.ts'],
                stageFilePaths: ['src/app.ts'],
                unstageFilePaths: ['src/staged.ts'],
                discardFilePaths: ['src/app.ts'],
                stashFilePaths: ['src/app.ts', 'src/staged.ts'],
                patchStagedFilePaths: ['src/staged.ts'],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: [],
                stashIncludeUntracked: true,
            },
        });

        await vscode.commands.executeCommand('lookGit.changes.selection.stage');
        await vscode.commands.executeCommand('lookGit.changes.selection.unstage');
        await vscode.commands.executeCommand('lookGit.changes.selection.discard');
        await vscode.commands.executeCommand('lookGit.changes.selection.stash');

        const submoduleCwd = path.join(repo.cwd, 'modules/lib');
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', submoduleCwd, 'add', '--', 'src/app.ts']));
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', submoduleCwd, 'reset', 'HEAD', '--', 'src/staged.ts']));
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith(['-C', submoduleCwd, 'checkout', '--', 'src/app.ts']));
        await vi.waitFor(() => expect(repo.exec).toHaveBeenCalledWith([
            '-C',
            submoduleCwd,
            'stash',
            'push',
            '--include-untracked',
            '-m',
            'save inner',
            '--',
            'src/app.ts',
            'src/staged.ts',
        ]));
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

    it('toolbar create branch replaces spaces in the entered branch name', async () => {
        setInputBoxValue('feature from changes');
        const repo = makeRepo();
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/toolbarCommand', command: 'createBranch' });

        await vi.waitFor(() => expect(repo.checkoutNewBranch).toHaveBeenCalledWith('feature-from-changes'));
        const inputOptions = getInputBoxOptions().at(-1) as { readonly validateInput?: (value: string) => unknown } | undefined;
        expect(inputOptions?.validateInput?.('feature bad:name')).toEqual({
            message: 'feature bad:name -> feature-bad-name',
            severity: vscode.InputBoxValidationSeverity.Info,
        });
        expect(inputOptions?.validateInput?.('HEAD')).toEqual({
            message: 'HEAD is reserved.',
            severity: vscode.InputBoxValidationSeverity.Error,
        });
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

    it('opens conflicts with the VS Code merge editor', async () => {
        const repo = makeRepo({ execRaw: conflictStageExecRaw() });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({ type: 'changes/openMergeEditor', filePath: 'src/conflict.ts' });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === '_open.mergeEditor');
        const args = mergeEditorOpenArgs(call?.args[0]);
        expect(args.base.scheme).toBe('lookgit-diff');
        expect(args.input1.title).toBe('Incoming');
        expect(args.input1.uri.scheme).toBe('lookgit-diff');
        expect(args.input2.title).toBe('Current');
        expect(args.input2.uri.scheme).toBe('lookgit-diff');
        assertUriWithPath(args.output, 'src/conflict.ts');
        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith(['cat-file', '-p', '3'.repeat(40)]));
        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith(['cat-file', '-p', '2'.repeat(40)]));
        expect(getCommandCalls().some((entry) => entry.command === 'git.openMergeEditor')).toBe(false);
        expect(getCommandCalls().some((entry) => entry.command === 'merge-conflict.accept.select')).toBe(false);
        expect(getCommandCalls().some((entry) => entry.command === 'vscode.open')).toBe(false);
    });

    it('opens every active conflict with the VS Code merge editor', async () => {
        const repo = makeRepo({
            execRaw: conflictStageExecRaw(undefined, ['src/a.ts', 'src/b.ts']),
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

        view.messageHandler?.({ type: 'changes/openAllMergeEditors' });

        await vi.waitFor(() => expect(getCommandCalls().filter((call) => call.command === '_open.mergeEditor')).toHaveLength(2));
        const outputs = getCommandCalls()
            .filter((call) => call.command === '_open.mergeEditor')
            .map((call) => mergeEditorOpenArgs(call.args[0]).output.path);
        expect(outputs).toEqual(expect.arrayContaining([
            expect.stringContaining('src/a.ts'),
            expect.stringContaining('src/b.ts'),
        ]));
        expect(getCommandCalls().some((entry) => entry.command === 'git.openMergeEditor')).toBe(false);
    });

    it('opens the first active conflict with the VS Code merge editor', async () => {
        const repo = makeRepo({
            execRaw: conflictStageExecRaw(undefined, ['src/a.ts', 'src/b.ts']),
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

        view.messageHandler?.({ type: 'changes/openFirstMergeEditor' });

        await vi.waitFor(() => expect(getCommandCalls().filter((call) => call.command === '_open.mergeEditor')).toHaveLength(1));
        const call = getCommandCalls().find((entry) => entry.command === '_open.mergeEditor');
        expect(mergeEditorOpenArgs(call?.args[0]).output.path).toContain('src/a.ts');
    });

    it('opens submodule conflicts with the VS Code merge editor', async () => {
        const repo = makeRepo({
            execRaw: conflictStageExecRaw('modules/lib'),
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/submoduleOpenMergeEditor',
            submodulePath: 'modules/lib',
            filePath: 'src/conflict.ts',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === '_open.mergeEditor');
        const args = mergeEditorOpenArgs(call?.args[0]);
        expect(args.input1.title).toBe('Incoming');
        expect(args.input2.title).toBe('Current');
        assertUriWithPath(args.output, 'modules/lib/src/conflict.ts');
        await vi.waitFor(() => expect(repo.execRaw).toHaveBeenCalledWith(['-C', 'modules/lib', 'cat-file', '-p', '3'.repeat(40)], undefined));
        expect(getCommandCalls().some((entry) => entry.command === 'git.openMergeEditor')).toBe(false);
        expect(getCommandCalls().some((entry) => entry.command === 'merge-conflict.accept.select')).toBe(false);
        expect(getCommandCalls().some((entry) => entry.command === 'vscode.open')).toBe(false);
    });

    it('opens every active submodule conflict with the VS Code merge editor', async () => {
        const repo = makeRepo({
            execRaw: conflictStageExecRaw('modules/lib', ['src/a.ts', 'src/b.ts']),
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/submoduleOpenAllMergeEditors',
            submodulePath: 'modules/lib',
        });

        await vi.waitFor(() => expect(getCommandCalls().filter((call) => call.command === '_open.mergeEditor')).toHaveLength(2));
        const outputs = getCommandCalls()
            .filter((call) => call.command === '_open.mergeEditor')
            .map((call) => mergeEditorOpenArgs(call.args[0]).output.path);
        expect(outputs).toEqual(expect.arrayContaining([
            expect.stringContaining('modules/lib/src/a.ts'),
            expect.stringContaining('modules/lib/src/b.ts'),
        ]));
        expect(getCommandCalls().some((entry) => entry.command === 'git.openMergeEditor')).toBe(false);
    });

    it('opens the first active submodule conflict with the VS Code merge editor', async () => {
        const repo = makeRepo({
            execRaw: conflictStageExecRaw('modules/lib', ['src/a.ts', 'src/b.ts']),
            getSubmodulePaths: vi.fn(async () => new Set(['modules/lib'])),
            getSubmoduleStatus: vi.fn(async () => [{ path: 'modules/lib', status: ' ' as const }]),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);

        view.messageHandler?.({
            type: 'changes/submoduleOpenFirstMergeEditor',
            submodulePath: 'modules/lib',
        });

        await vi.waitFor(() => expect(getCommandCalls().filter((call) => call.command === '_open.mergeEditor')).toHaveLength(1));
        const call = getCommandCalls().find((entry) => entry.command === '_open.mergeEditor');
        expect(mergeEditorOpenArgs(call?.args[0]).output.path).toContain('modules/lib/src/a.ts');
    });

    it('opens a real Git merge conflict with the modern merge editor input', async () => {
        const fixture = createConflictWorkflowFixture();
        try {
            expect(() => fixture.git(['merge', 'incoming'])).toThrow();
            const repo = new GitProcessRepository(fixture.cwd);
            const provider = makeProvider(repo);
            const view = makeWebviewView();
            provider.resolveWebviewView(view);

            view.messageHandler?.({ type: 'changes/openMergeEditor', filePath: 'conflict.txt' });

            await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === '_open.mergeEditor')).toBe(true));
            const call = getCommandCalls().find((entry) => entry.command === '_open.mergeEditor');
            const args = mergeEditorOpenArgs(call?.args[0]);
            expect(args.base.scheme).toBe('lookgit-diff');
            expect(args.input1.title).toBe('Incoming');
            expect(args.input1.uri.scheme).toBe('lookgit-diff');
            expect(args.input2.title).toBe('Current');
            expect(args.input2.uri.scheme).toBe('lookgit-diff');
            assertUriWithPath(args.output, 'conflict.txt');
        } finally {
            fixture.cleanup();
        }
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
            path.join(repo.cwd, 'modules/lib'),
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
            path.join(repo.cwd, 'modules/lib'),
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
            path.join(repo.cwd, 'modules/lib'),
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
            path.join(repo.cwd, 'modules/lib'),
            'commit',
            '-m',
            'feat: inner push',
        ]));
        await vi.waitFor(() => expect(mockWindow.terminals).toContainEqual(expect.objectContaining({
            name: 'Look Git Remote: modules/lib',
            cwd: path.join(repo.cwd, 'modules/lib'),
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
            ['--no-optional-locks', '-C', path.join(repo.cwd, 'modules/lib'), 'status', '--porcelain', '-z', '--untracked-files=all'],
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
        expect(repo.exec).not.toHaveBeenCalledWith(['--no-optional-locks', '-C', path.join(repo.cwd, 'modules/lib'), 'status', '--porcelain', '-z', '--untracked-files=all']);
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
        const repo = makeRepo({
            execRaw: vi.fn(async () => 'old content\n'),
        });
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
        expectReadonlyUri(call?.args[0], 'new-name.ts');
        assertUriWithPath(call?.args[1], 'src/new-name.ts');
        expect(repo.execRaw).toHaveBeenCalledWith(['--no-optional-locks', 'show', ':src/old-name.ts']);
    });

    it('opens stash rename diffs against the original stash parent path', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => args.at(-1) === 'stash@{2}^:src/old-name.ts'
                ? 'old stashed content\n'
                : 'new stashed content\n'),
        });
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
        expectReadonlyUri(call?.args[0], 'old-name.ts');
        expectReadonlyUri(call?.args[1], 'new-name.ts');
        expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['--no-optional-locks', 'show', 'stash@{2}^:src/old-name.ts']);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['--no-optional-locks', 'show', 'stash@{2}:src/new-name.ts']);
    });

    it('opens staged file diffs from virtual git content instead of VS Code git URIs', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => args.at(-1) === 'HEAD:src/app.ts'
                ? 'head content\n'
                : 'index content\n'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openDiff',
            filePath: 'src/app.ts',
            isStaged: true,
            indexStatus: 'M',
            workTreeStatus: ' ',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expectReadonlyUri(call?.args[0], 'app.ts');
        expectReadonlyUri(call?.args[1], 'app.ts');
        expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['--no-optional-locks', 'show', 'HEAD:src/app.ts']);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['--no-optional-locks', 'show', ':src/app.ts']);
    });

    it('opens real staged file diffs from git without the VS Code git content provider', async () => {
        const fixture = createTempGitRepo();
        try {
            fixture.commitFile('src/app.ts', 'head content\n', 'base');
            fixture.write('src/app.ts', 'index content\n');
            fixture.git(['add', 'src/app.ts']);
            const repo = new GitProcessRepository(fixture.cwd);
            const provider = makeProvider(repo);
            const view = makeWebviewView();
            provider.resolveWebviewView(view);
            view.messageHandler?.({
                type: 'changes/openDiff',
                filePath: 'src/app.ts',
                isStaged: true,
                indexStatus: 'M',
                workTreeStatus: ' ',
            });

            await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
            const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
            expectReadonlyUri(call?.args[0], 'app.ts');
            expectReadonlyUri(call?.args[1], 'app.ts');
        } finally {
            fixture.cleanup();
        }
    });

    it('opens added stash files from the untracked stash parent when needed', async () => {
        const repo = makeRepo({
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.at(-1) === 'stash@{0}:src/untracked.ts') {
                    throw new Error('path does not exist in stash tree');
                }
                return 'untracked stash content\n';
            }),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openStashDiff',
            index: 0,
            filePath: 'src/untracked.ts',
            status: 'A',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expectReadonlyUri(call?.args[0], 'untracked.ts');
        expectReadonlyUri(call?.args[1], 'untracked.ts');
        expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['--no-optional-locks', 'show', 'stash@{0}:src/untracked.ts']);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['--no-optional-locks', 'show', 'stash@{0}^3:src/untracked.ts']);
    });

    it('opens submodule stash diffs from virtual git content inside the submodule', async () => {
        const repo = makeRepo({
            getSubmodulePaths: vi.fn(async () => new Set(['modules/child'])),
            execRaw: vi.fn(async (args: readonly string[]) => args.at(-1) === 'stash@{1}^:src/old.ts'
                ? 'old submodule stash\n'
                : 'new submodule stash\n'),
        });
        const provider = makeProvider(repo);
        const view = makeWebviewView();
        provider.resolveWebviewView(view);
        view.messageHandler?.({
            type: 'changes/openSubmoduleStashDiff',
            submodulePath: 'modules/child',
            index: 1,
            filePath: 'src/new.ts',
            origPath: 'src/old.ts',
            status: 'R',
        });

        await vi.waitFor(() => expect(getCommandCalls().some((call) => call.command === 'vscode.diff')).toBe(true));
        const call = getCommandCalls().find((entry) => entry.command === 'vscode.diff');
        expectReadonlyUri(call?.args[0], 'old.ts');
        expectReadonlyUri(call?.args[1], 'new.ts');
        expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['-C', 'modules/child', '--no-optional-locks', 'show', 'stash@{1}^:src/old.ts'], undefined);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['-C', 'modules/child', '--no-optional-locks', 'show', 'stash@{1}:src/new.ts'], undefined);
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
            execRaw: vi.fn(async () => 'index content\n'),
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
        expectReadonlyUri(call?.args[0], 'inner.ts');
        assertUriWithPath(call?.args[1], 'modules/child/src/inner.ts');
        expect(repo.execRaw).toHaveBeenCalledWith(['-C', 'modules/child', '--no-optional-locks', 'show', ':src/inner.ts'], undefined);
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
