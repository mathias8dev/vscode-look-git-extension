import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { GraphViewProvider } from '../src/graphView/graphPanel';
import type { GitCommitInfo } from '../src/gitService';
import { makeWebviewView, resetVscodeMock } from './helpers/providerRuntime';

describe('GraphViewProvider webview messages', () => {
    beforeEach(resetVscodeMock);

    function graphCommit(index: number): GitCommitInfo & { refs: string[] } {
        const hash = index.toString(16).padStart(40, '0');
        return {
            hash,
            shortHash: hash.substring(0, 7),
            message: `graph commit ${index}`,
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
            refs: [],
        };
    }

    describe('webview lifecycle', () => {
        it('resolveWebviewView wires graph html, message handling, and initial graph data', async () => {
            const commit: GitCommitInfo = {
                hash: 'abc123456789',
                shortHash: 'abc1234',
                message: 'initial graph commit',
                authorName: 'Author',
                authorEmail: 'a@example.com',
                authorDate: new Date('2024-01-01T00:00:00Z'),
                parentHashes: [],
            };
            const service = {
                getAllBranches: vi.fn(async () => [{ name: 'main', isRemote: false, isCurrent: true, hash: 'abc1234' }]),
                getAllTags: vi.fn(async () => []),
                getGraphLog: vi.fn(async () => [commit]),
                getCurrentBranch: vi.fn(async () => 'main'),
                getUserName: vi.fn(async () => 'Author'),
            };
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();

            provider.resolveWebviewView(view as any, {} as any, {} as any);

            expect(view.webview.options).toEqual({
                enableScripts: true,
                localResourceRoots: [expect.objectContaining({ path: '/ext/dist/webview' })],
            });
            expect(view.webview.html).toContain('Content-Security-Policy');
            expect(view.webview.html).toContain('dist/webview/graph.js');
            expect(view.webview.html).toMatch(/script-src 'nonce-[^']+'/);
            expect(view.messageHandler).toEqual(expect.any(Function));

            await vi.waitFor(() => {
                expect(view.messages).toContainEqual(expect.objectContaining({
                    type: 'graphData',
                    data: expect.objectContaining({
                        branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: 'abc1234' }],
                        currentBranch: 'main',
                        currentUser: 'Author',
                    }),
                }));
            });
        });

        it('defers graph Git log refreshes while the graph webview is hidden', async () => {
            const service = {
                getAllBranches: vi.fn(async () => [{ name: 'main', isRemote: false, isCurrent: true, hash: 'abc1234' }]),
                getAllTags: vi.fn(async () => []),
                getGraphLog: vi.fn(async () => []),
                getCurrentBranch: vi.fn(async () => 'main'),
                getUserName: vi.fn(async () => 'Author'),
            };
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            view.visible = false;

            provider.resolveWebviewView(view as any, {} as any, {} as any);
            await Promise.resolve();

            expect(service.getGraphLog).not.toHaveBeenCalled();
            expect(service.getAllBranches).not.toHaveBeenCalled();

            view.visible = true;
            view.visibilityHandler?.();

            await vi.waitFor(() => expect(service.getGraphLog).toHaveBeenCalledTimes(1));
            expect(service.getAllBranches).toHaveBeenCalledTimes(1);
        });

        it('derives current branch from branch metadata without an extra git lookup', async () => {
            const service = {
                getAllBranches: vi.fn(async () => [{ name: 'main', isRemote: false, isCurrent: true, hash: 'abc1234' }]),
                getAllTags: vi.fn(async () => []),
                getGraphLog: vi.fn(async () => []),
                getCurrentBranch: vi.fn(async () => 'main'),
                getUserName: vi.fn(async () => 'Author'),
            };
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;

            await provider.refresh();

            expect(service.getCurrentBranch).not.toHaveBeenCalled();
            expect(view.messages.at(-1)).toEqual(expect.objectContaining({
                type: 'graphData',
                data: expect.objectContaining({ currentBranch: 'main' }),
            }));
        });
    });

    describe('getCommitDetails and openDiff', () => {
        function makeGraphService(overrides: Record<string, unknown> = {}) {
            return {
                getAllBranches: vi.fn(async () => []),
                getAllTags: vi.fn(async () => []),
                getGraphLog: vi.fn(async () => []),
                getCurrentBranch: vi.fn(async () => 'main'),
                getUserName: vi.fn(async () => 'Test User'),
                getCommitFiles: vi.fn(async () => [{ status: 'M', filePath: 'src/file.ts' }]),
                getCommitMessage: vi.fn(async () => 'commit message\n\nbody'),
                getWorkingDirectory: vi.fn(() => '/workspace'),
                ...overrides,
            };
        }

        it('getCommitDetails posts commitDetails with files and fullMessage', async () => {
            const service = makeGraphService();
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'getCommitDetails', hash: 'abc1234' });
            expect(view.messages).toContainEqual({
                type: 'commitDetails',
                hash: 'abc1234',
                files: [{ status: 'M', filePath: 'src/file.ts' }],
                fullMessage: 'commit message\n\nbody',
            });
        });

        it('getCommitDetails posts error when git throws', async () => {
            const service = makeGraphService({
                getCommitFiles: vi.fn(async () => { throw new Error('commit not found'); }),
            });
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'getCommitDetails', hash: 'deadbeef' });
            expect(view.messages).toContainEqual(expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('commit not found'),
            }));
        });

        it('openDiff executes vscode.diff with git-scheme URIs', async () => {
            const service = makeGraphService();
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({
                type: 'openDiff',
                filePath: 'src/file.ts',
                commitHash: 'abc123456789',
                status: 'M',
            });
            const call = (vscode.commands as any).calls.find((c: any) => c.command === 'vscode.diff');
            expect(call).toBeDefined();
            expect(call.args[0].scheme).toBe('git');
            expect(call.args[1].scheme).toBe('git');
            expect(call.args[2]).toContain('src/file.ts');
        });

        it('ready triggers refresh and posts graphData', async () => {
            const service = makeGraphService();
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'ready' });
            expect(service.getGraphLog).toHaveBeenCalled();
        });
    });

    describe('executeBranchCommand all cases', () => {
        function makeGraphService(overrides: Record<string, unknown> = {}) {
            return {
                getAllBranches: vi.fn(async () => []),
                getAllTags: vi.fn(async () => []),
                getGraphLog: vi.fn(async () => []),
                getCurrentBranch: vi.fn(async () => 'main'),
                getUserName: vi.fn(async () => 'Test User'),
                checkout: vi.fn(async () => ''),
                checkoutRemoteBranch: vi.fn(async () => ''),
                checkoutNewBranch: vi.fn(async () => ''),
                deleteBranch: vi.fn(async () => ''),
                deleteRemoteBranch: vi.fn(async () => ''),
                renameBranch: vi.fn(async () => ''),
                pushBranch: vi.fn(async () => ''),
                fetchBranch: vi.fn(async () => ''),
                rebase: vi.fn(async () => ''),
                merge: vi.fn(async () => ''),
                getRemotes: vi.fn(async () => ['origin']),
                ...overrides,
            };
        }

        async function handle(service: ReturnType<typeof makeGraphService>, payload: object): Promise<void> {
            const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'executeBranchCommand', ...payload });
        }

        it('checkout calls service.checkout', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'checkout', branch: 'feature', isRemote: false });
            expect(service.checkout).toHaveBeenCalledWith('feature');
            expect(service.checkoutRemoteBranch).not.toHaveBeenCalled();
        });

        it('remote checkout creates or reuses a local tracking branch', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'checkout', branch: 'origin/feature/nested', isRemote: true });
            expect(service.checkoutRemoteBranch).toHaveBeenCalledWith('origin/feature/nested');
            expect(service.checkout).not.toHaveBeenCalled();
        });

        it('uses coordinated repository refresh after branch checkout', async () => {
            const service = makeGraphService();
            let provider!: GraphViewProvider;
            const refreshRepositoryViews = vi.fn(async () => {
                await provider.refresh();
            });
            provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any, refreshRepositoryViews);
            const view = makeWebviewView();
            (provider as any).view = view;

            await (provider as any).handleMessage({
                type: 'executeBranchCommand',
                command: 'checkout',
                branch: 'feature',
                isRemote: false,
            });

            expect(service.checkout).toHaveBeenCalledWith('feature');
            expect(refreshRepositoryViews).toHaveBeenCalledOnce();
            expect(service.getGraphLog).toHaveBeenCalled();
            expect(view.messages).toContainEqual(expect.objectContaining({ type: 'graphData' }));
        });

        it('newBranchFrom confirmed calls checkoutNewBranch', async () => {
            (vscode.window as any).inputBoxValue = 'new-feat';
            const service = makeGraphService();
            await handle(service, { command: 'newBranchFrom', branch: 'feature', isRemote: false });
            expect(service.checkoutNewBranch).toHaveBeenCalledWith('new-feat', 'feature');
        });

        it('newBranchFrom cancelled does not call checkoutNewBranch', async () => {
            (vscode.window as any).inputBoxValue = undefined;
            const service = makeGraphService();
            await handle(service, { command: 'newBranchFrom', branch: 'feature', isRemote: false });
            expect(service.checkoutNewBranch).not.toHaveBeenCalled();
        });

        it('checkoutRebaseOnto calls getCurrentBranch then checkout then rebase', async () => {
            const calls: string[] = [];
            const service = makeGraphService({
                getCurrentBranch: vi.fn(async () => { calls.push('getCurrentBranch'); return 'main'; }),
                checkout: vi.fn(async () => { calls.push('checkout'); return ''; }),
                rebase: vi.fn(async () => { calls.push('rebase'); return ''; }),
            });
            await handle(service, { command: 'checkoutRebaseOnto', branch: 'feature', isRemote: true });
            expect(calls.slice(0, 3)).toEqual(['getCurrentBranch', 'checkout', 'rebase']);
            expect(service.rebase).toHaveBeenCalledWith('main');
        });

        it('delete local branch confirmed calls deleteBranch', async () => {
            (vscode.window as any).warningChoice = 'Delete';
            const service = makeGraphService();
            await handle(service, { command: 'delete', branch: 'feature', isRemote: false });
            expect(service.deleteBranch).toHaveBeenCalledWith('feature');
        });

        it('delete local branch cancelled does not call deleteBranch', async () => {
            (vscode.window as any).warningChoice = undefined;
            const service = makeGraphService();
            await handle(service, { command: 'delete', branch: 'feature', isRemote: false });
            expect(service.deleteBranch).not.toHaveBeenCalled();
        });

        it('delete remote branch confirmed calls deleteRemoteBranch', async () => {
            (vscode.window as any).warningChoice = 'Delete';
            const service = makeGraphService();
            await handle(service, { command: 'delete', branch: 'origin/feature', isRemote: true });
            expect(service.deleteRemoteBranch).toHaveBeenCalledWith('origin', 'feature');
        });

        it('rename confirmed calls renameBranch', async () => {
            (vscode.window as any).inputBoxValue = 'new-name';
            const service = makeGraphService();
            await handle(service, { command: 'rename', branch: 'old-name', isRemote: false });
            expect(service.renameBranch).toHaveBeenCalledWith('old-name', 'new-name');
        });

        it('rename cancelled does not call renameBranch', async () => {
            (vscode.window as any).inputBoxValue = undefined;
            const service = makeGraphService();
            await handle(service, { command: 'rename', branch: 'old-name', isRemote: false });
            expect(service.renameBranch).not.toHaveBeenCalled();
        });

        it('push with single remote calls pushBranch', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'push', branch: 'feature', isRemote: false });
            expect(service.pushBranch).toHaveBeenCalledWith('origin', 'feature');
        });

        it('update calls fetchBranch', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'update', branch: 'feature', isRemote: false });
            expect(service.fetchBranch).toHaveBeenCalledWith('origin', 'feature');
        });

        it('update remote branch strips the remote prefix before fetching', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'update', branch: 'origin/feature/ui', isRemote: true });
            expect(service.fetchBranch).toHaveBeenCalledWith('origin', 'feature/ui');
        });

        it('rebaseOnto calls service.rebase', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'rebaseOnto', branch: 'feature', isRemote: false });
            expect(service.rebase).toHaveBeenCalledWith('feature');
        });

        it('mergeInto calls service.merge', async () => {
            const service = makeGraphService();
            await handle(service, { command: 'mergeInto', branch: 'feature', isRemote: false });
            expect(service.merge).toHaveBeenCalledWith('feature');
        });

        it('branch operation error shows error message', async () => {
            const service = makeGraphService({
                checkout: vi.fn(async () => { throw new Error('branch not found'); }),
            });
            await handle(service, { command: 'checkout', branch: 'missing', isRemote: false });
            expect((vscode.window as any).errorMessages).toContainEqual('Branch operation failed: branch not found');
        });
    });

    it('rejects unlisted commands from the graph webview', async () => {
        const service = {
            getCommit: vi.fn(),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);

        await (provider as any).handleMessage({
            type: 'executeCommand',
            command: 'workbench.action.openSettings',
            commitHash: 'abc1234',
        });

        expect(service.getCommit).not.toHaveBeenCalled();
        expect((vscode.commands as any).calls).toEqual([]);
        expect((vscode.window as any).errorMessages[0]).toContain('Command is not allowed');
    });

    it('resolves an allowed graph command to a CommitItem before executing it', async () => {
        const commit: GitCommitInfo = {
            hash: 'abc1234567890',
            shortHash: 'abc1234',
            message: 'subject',
            authorName: 'Author',
            authorEmail: 'a@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
        };
        const service = {
            getCommit: vi.fn(async () => commit),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);

        await (provider as any).handleMessage({
            type: 'executeCommand',
            command: 'lookGit.copyCommitHash',
            commitHash: commit.hash,
        });

        expect(service.getCommit).toHaveBeenCalledWith(commit.hash);
        expect((vscode.commands as any).calls[0].command).toBe('lookGit.copyCommitHash');
        expect((vscode.commands as any).calls[0].args[0].commitInfo).toEqual(commit);
    });

    it('reports an error when an allowed graph command targets a missing commit', async () => {
        const service = {
            getCommit: vi.fn(async () => undefined),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);

        await (provider as any).handleMessage({
            type: 'executeCommand',
            command: 'lookGit.copyCommitHash',
            commitHash: 'missing',
        });

        expect((vscode.commands as any).calls).toEqual([]);
        expect((vscode.window as any).errorMessages).toContainEqual('Commit not found: missing');
    });

    it('keeps branch and path filters across refreshes', async () => {
        const service = {
            getGraphLog: vi.fn(async (limit: number) => Array.from({ length: limit }, (_, index) => graphCommit(index))),
            getAllBranches: vi.fn(async () => []),
            getAllTags: vi.fn(async () => []),
            getCurrentBranch: vi.fn(async () => 'main'),
            getUserName: vi.fn(async () => 'Test User'),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;

        await provider.refresh(['main'], 'src/index.ts');
        await provider.refresh();

        expect(service.getGraphLog).toHaveBeenNthCalledWith(1, 301, ['main'], 'src/index.ts');
        expect(service.getGraphLog).toHaveBeenNthCalledWith(2, 301, ['main'], 'src/index.ts');
    });

    it('passes graph search, author, and date filters to GitService and keeps them while loading more', async () => {
        const service = {
            getGraphLog: vi.fn(async (limit: number) => Array.from({ length: limit }, (_, index) => graphCommit(index))),
            getAllBranches: vi.fn(async () => []),
            getAllTags: vi.fn(async () => []),
            getCurrentBranch: vi.fn(async () => 'main'),
            getUserName: vi.fn(async () => 'Test User'),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;

        await (provider as any).handleMessage({
            type: 'selectBranch',
            branches: ['main'],
            path: 'src/index.ts',
            search: 'needle',
            authors: ['Alice'],
            dateFrom: '2024-02-01',
            dateTo: '2024-02-02',
        });
        await (provider as any).handleMessage({ type: 'loadMoreGraph' });

        const filters = {
            search: 'needle',
            authors: ['Alice'],
            dateFrom: '2024-02-01',
            dateTo: '2024-02-02',
        };
        expect(service.getGraphLog).toHaveBeenNthCalledWith(1, 301, ['main'], 'src/index.ts', filters);
        expect(service.getGraphLog).toHaveBeenNthCalledWith(2, 601, ['main'], 'src/index.ts', filters);
    });

    it('loads more graph data by increasing the commit window and keeping filters', async () => {
        const service = {
            getGraphLog: vi.fn(async (limit: number) => Array.from({ length: limit }, (_, index) => graphCommit(index))),
            getAllBranches: vi.fn(async () => []),
            getAllTags: vi.fn(async () => []),
            getCurrentBranch: vi.fn(async () => 'main'),
            getUserName: vi.fn(async () => 'Test User'),
        };
        const provider = new GraphViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;

        await provider.refresh(['main'], 'src/index.ts');
        await (provider as any).handleMessage({ type: 'loadMoreGraph' });

        expect(service.getGraphLog).toHaveBeenNthCalledWith(1, 301, ['main'], 'src/index.ts');
        expect(service.getGraphLog).toHaveBeenNthCalledWith(2, 601, ['main'], 'src/index.ts');
        expect(view.messages.at(-1)).toEqual(expect.objectContaining({
            type: 'graphData',
            data: expect.objectContaining({
                loadedCount: 600,
                hasMore: true,
            }),
        }));
    });
});
