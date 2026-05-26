import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChangesViewProvider } from '../src/changesView/changesProvider';
import { GraphViewProvider } from '../src/graphView/graphPanel';
import type { GitCommitInfo, GitStatusEntry } from '../src/gitService';

function resetVscodeMock(): void {
    (vscode.commands as any).reset();
    (vscode.window as any).reset();
}

function makeWebviewView() {
    const messages: unknown[] = [];
    let messageHandler: ((msg: unknown) => unknown) | undefined;
    return {
        messages,
        get messageHandler() {
            return messageHandler;
        },
        webview: {
            options: {},
            html: '',
            cspSource: 'vscode-webview://test',
            asWebviewUri: (uri: unknown) => uri,
            postMessage: vi.fn((msg: unknown) => {
                messages.push(msg);
                return Promise.resolve(true);
            }),
            onDidReceiveMessage: vi.fn((handler: (msg: unknown) => unknown) => {
                messageHandler = handler;
                return { dispose: vi.fn() };
            }),
        },
        visible: true,
        badge: undefined,
        show: vi.fn(),
        onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
    };
}

function statusEntry(filePath: string): GitStatusEntry {
    return { indexStatus: 'M', workTreeStatus: 'M', filePath };
}

describe('ChangesViewProvider webview messages', () => {
    beforeEach(resetVscodeMock);

    describe('discardFile and abortOp with confirmation', () => {
        function baseService(overrides: Record<string, unknown> = {}) {
            return {
                discardFile: vi.fn(async () => ''),
                unstageAll: vi.fn(async () => ''),
                mergeAbort: vi.fn(async () => ''),
                rebaseAbort: vi.fn(async () => ''),
                stashDrop: vi.fn(async () => ''),
                getStatus: vi.fn(async () => ({
                    staged: [], unstaged: [], conflicts: [], conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
                ...overrides,
            };
        }

        it('discardFile confirmed calls service.discardFile', async () => {
            (vscode.window as any).warningChoice = 'Discard';
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'discardFile', filePath: 'unstaged.ts' });
            expect(service.discardFile).toHaveBeenCalledWith('unstaged.ts');
        });

        it('discardFile cancelled does not call service.discardFile', async () => {
            (vscode.window as any).warningChoice = undefined;
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'discardFile', filePath: 'unstaged.ts' });
            expect(service.discardFile).not.toHaveBeenCalled();
        });

        it('discardAll cancelled does not call unstageAll', async () => {
            (vscode.window as any).warningChoice = undefined;
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'discardAll' });
            expect(service.unstageAll).not.toHaveBeenCalled();
        });

        it('abortOp merge confirmed calls mergeAbort and shows info', async () => {
            (vscode.window as any).warningChoice = 'Abort';
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'abortOp', conflictState: 'merge' });
            expect(service.mergeAbort).toHaveBeenCalled();
            expect((vscode.window as any).infoMessages).toContainEqual('Merge aborted.');
        });

        it('abortOp merge cancelled does not call mergeAbort', async () => {
            (vscode.window as any).warningChoice = undefined;
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'abortOp', conflictState: 'merge' });
            expect(service.mergeAbort).not.toHaveBeenCalled();
        });

        it('abortOp rebase confirmed calls rebaseAbort and shows info', async () => {
            (vscode.window as any).warningChoice = 'Abort';
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'abortOp', conflictState: 'rebase' });
            expect(service.rebaseAbort).toHaveBeenCalled();
            expect((vscode.window as any).infoMessages).toContainEqual('Rebase aborted.');
        });

        it('stashDrop confirmed calls service.stashDrop', async () => {
            (vscode.window as any).warningChoice = 'Drop';
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stashDrop', index: 0 });
            expect(service.stashDrop).toHaveBeenCalledWith(0);
        });

        it('stashDrop cancelled does not call service.stashDrop', async () => {
            (vscode.window as any).warningChoice = undefined;
            const service = baseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stashDrop', index: 0 });
            expect(service.stashDrop).not.toHaveBeenCalled();
        });
    });

    describe('commit modes', () => {
        function makeCommitService(overrides: Record<string, unknown> = {}) {
            return {
                commit: vi.fn(async () => ''),
                commitAmend: vi.fn(async () => ''),
                push: vi.fn(async () => ''),
                pullAndPush: vi.fn(async () => ''),
                getStatus: vi.fn(async () => ({
                    staged: [], unstaged: [], conflicts: [], conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
                ...overrides,
            };
        }

        it('commit mode calls service.commit and posts commitResult success', async () => {
            const service = makeCommitService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'commit', message: 'my commit' });
            expect(service.commit).toHaveBeenCalledWith('my commit');
            expect((vscode.window as any).infoMessages).toContainEqual('Changes committed successfully.');
            expect(view.messages).toContainEqual({ type: 'commitResult', success: true });
        });

        it('amend mode calls service.commitAmend', async () => {
            const service = makeCommitService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'amend', message: 'amended' });
            expect(service.commitAmend).toHaveBeenCalledWith('amended');
            expect((vscode.window as any).infoMessages).toContainEqual('Commit amended successfully.');
            expect(view.messages).toContainEqual({ type: 'commitResult', success: true });
        });

        it('commitPush mode calls service.commit then service.push in order', async () => {
            const calls: string[] = [];
            const service = makeCommitService({
                commit: vi.fn(async () => { calls.push('commit'); return ''; }),
                push: vi.fn(async () => { calls.push('push'); return ''; }),
            });
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'commitPush', message: 'push it' });
            expect(calls).toEqual(['commit', 'push']);
            expect((vscode.window as any).infoMessages).toContainEqual('Changes committed and pushed.');
        });

        it('commitSync mode calls service.commit then service.pullAndPush in order', async () => {
            const calls: string[] = [];
            const service = makeCommitService({
                commit: vi.fn(async () => { calls.push('commit'); return ''; }),
                pullAndPush: vi.fn(async () => { calls.push('pullAndPush'); return ''; }),
            });
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'commitSync', message: 'sync it' });
            expect(calls).toEqual(['commit', 'pullAndPush']);
            expect((vscode.window as any).infoMessages).toContainEqual('Changes committed and synced.');
        });

        it('empty message shows error and posts commitResult false without calling git', async () => {
            const service = makeCommitService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'commit', message: '' });
            expect(service.commit).not.toHaveBeenCalled();
            expect((vscode.window as any).errorMessages).toContainEqual('Commit message cannot be empty.');
            expect(view.messages).toContainEqual({ type: 'commitResult', success: false });
        });

        it('git error during commit posts commitResult false and shows error', async () => {
            const service = makeCommitService({
                commit: vi.fn(async () => { throw new Error('nothing to commit'); }),
            });
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'commit', mode: 'commit', message: 'try' });
            expect(view.messages).toContainEqual({ type: 'commitResult', success: false });
            expect((vscode.window as any).errorMessages[0]).toContain('nothing to commit');
        });
    });

    describe('stash operations', () => {
        function makeStashService(overrides: Record<string, unknown> = {}) {
            return {
                stash: vi.fn(async () => ''),
                stashStaged: vi.fn(async () => ''),
                stashPop: vi.fn(async () => ''),
                stashApply: vi.fn(async () => ''),
                stashDrop: vi.fn(async () => ''),
                getStashFiles: vi.fn(async () => [{ status: 'M', filePath: 'stashed.ts' }]),
                getStatus: vi.fn(async () => ({
                    staged: [], unstaged: [], conflicts: [], conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
                ...overrides,
            };
        }

        it('stash without message calls service.stash(undefined)', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stash' });
            expect(service.stash).toHaveBeenCalledWith(undefined);
            expect((vscode.window as any).infoMessages).toContainEqual('Changes stashed.');
        });

        it('stash with message calls service.stash with that message', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stash', message: 'my message' });
            expect(service.stash).toHaveBeenCalledWith('my message');
        });

        it('stashStaged calls service.stashStaged(undefined) and shows info', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stashStaged' });
            expect(service.stashStaged).toHaveBeenCalledWith(undefined);
            expect((vscode.window as any).infoMessages).toContainEqual('Staged changes stashed.');
        });

        it('stashPop index 2 calls service.stashPop(2)', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stashPop', index: 2 });
            expect(service.stashPop).toHaveBeenCalledWith(2);
            expect((vscode.window as any).infoMessages).toContainEqual('Stash popped.');
        });

        it('stashApply index 1 calls service.stashApply(1)', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'stashApply', index: 1 });
            expect(service.stashApply).toHaveBeenCalledWith(1);
            expect((vscode.window as any).infoMessages).toContainEqual('Stash applied.');
        });

        it('getStashFiles calls service.getStashFiles and posts stashFiles message', async () => {
            const service = makeStashService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            await (provider as any).handleMessage({ type: 'getStashFiles', index: 0 });
            expect(service.getStashFiles).toHaveBeenCalledWith(0);
            expect(view.messages).toContainEqual({
                type: 'stashFiles',
                index: 0,
                files: [{ status: 'M', filePath: 'stashed.ts' }],
            });
        });
    });

    it('discardAll unstages before discarding every remaining unstaged file', async () => {
        const calls: string[] = [];
        const service = {
            unstageAll: vi.fn(async () => { calls.push('unstageAll'); return ''; }),
            getStatus: vi.fn()
                .mockResolvedValueOnce({
                    staged: [],
                    unstaged: [statusEntry('staged.txt'), statusEntry('unstaged.txt')],
                    conflicts: [],
                    conflictState: 'none',
                })
                .mockResolvedValue({
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                }),
            discardFile: vi.fn(async (filePath: string) => { calls.push(`discard:${filePath}`); return ''; }),
            stashList: vi.fn(async () => []),
        };
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;
        (vscode.window as any).warningChoice = 'Discard All';

        await (provider as any).handleMessage({ type: 'discardAll' });

        expect(calls).toEqual(['unstageAll', 'discard:staged.txt', 'discard:unstaged.txt']);
        expect(service.discardFile).toHaveBeenCalledTimes(2);
    });

    it('keeps the commit message available when commit fails', async () => {
        const service = {
            commit: vi.fn(async () => { throw new Error('nothing to commit'); }),
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [statusEntry('file.txt')],
                conflicts: [],
                conflictState: 'none',
            })),
            stashList: vi.fn(async () => []),
        };
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;

        await (provider as any).handleMessage({
            type: 'commit',
            mode: 'commit',
            message: 'do not clear me on failure',
        });

        expect(view.messages).toContainEqual({ type: 'commitResult', success: false });
        expect((vscode.window as any).errorMessages[0]).toContain('nothing to commit');
    });

    describe('simple git delegation', () => {
        function makeService(overrides: Record<string, unknown> = {}) {
            return {
                stageFile: vi.fn(async () => ''),
                unstageFile: vi.fn(async () => ''),
                stageAll: vi.fn(async () => ''),
                unstageAll: vi.fn(async () => ''),
                acceptOurs: vi.fn(async () => ''),
                acceptTheirs: vi.fn(async () => ''),
                getStatus: vi.fn(async () => ({
                    staged: [], unstaged: [], conflicts: [], conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
                ...overrides,
            };
        }

        function makeProvider(service: ReturnType<typeof makeService>) {
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            (provider as any).view = view;
            return { provider, view };
        }

        it('stageFile calls service.stageFile', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'stageFile', filePath: 'file.ts' });
            expect(service.stageFile).toHaveBeenCalledWith('file.ts');
        });

        it('unstageFile calls service.unstageFile', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'unstageFile', filePath: 'file.ts' });
            expect(service.unstageFile).toHaveBeenCalledWith('file.ts');
        });

        it('stageAll calls service.stageAll', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'stageAll' });
            expect(service.stageAll).toHaveBeenCalled();
        });

        it('unstageAll calls service.unstageAll', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'unstageAll' });
            expect(service.unstageAll).toHaveBeenCalled();
        });

        it('markResolved calls service.stageFile with the conflict path', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'markResolved', filePath: 'conflict.ts' });
            expect(service.stageFile).toHaveBeenCalledWith('conflict.ts');
        });

        it('acceptOurs calls acceptOurs then stageFile in order', async () => {
            const calls: string[] = [];
            const service = makeService({
                acceptOurs: vi.fn(async () => { calls.push('acceptOurs'); return ''; }),
                stageFile: vi.fn(async () => { calls.push('stageFile'); return ''; }),
            });
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'acceptOurs', filePath: 'f.ts' });
            expect(calls).toEqual(['acceptOurs', 'stageFile']);
            expect(service.stageFile).toHaveBeenCalledWith('f.ts');
        });

        it('acceptTheirs calls acceptTheirs then stageFile in order', async () => {
            const calls: string[] = [];
            const service = makeService({
                acceptTheirs: vi.fn(async () => { calls.push('acceptTheirs'); return ''; }),
                stageFile: vi.fn(async () => { calls.push('stageFile'); return ''; }),
            });
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'acceptTheirs', filePath: 'f.ts' });
            expect(calls).toEqual(['acceptTheirs', 'stageFile']);
            expect(service.stageFile).toHaveBeenCalledWith('f.ts');
        });

        it('ready message calls getStatus (triggers refresh)', async () => {
            const service = makeService();
            const { provider } = makeProvider(service);
            await (provider as any).handleMessage({ type: 'ready' });
            // refresh() is fire-and-forget; verify it was triggered by checking getStatus was called
            await Promise.resolve();
            expect(service.getStatus).toHaveBeenCalled();
        });
    });

    it('acceptAllTheirs resolves and stages conflicts sequentially', async () => {
        const calls: string[] = [];
        const service = {
            getStatus: vi.fn()
                .mockResolvedValueOnce({
                    staged: [],
                    unstaged: [],
                    conflicts: [statusEntry('a.txt'), statusEntry('b.txt')],
                    conflictState: 'merge',
                })
                .mockResolvedValue({
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                }),
            acceptTheirs: vi.fn(async (filePath: string) => { calls.push(`accept:${filePath}`); return ''; }),
            stageFile: vi.fn(async (filePath: string) => { calls.push(`stage:${filePath}`); return ''; }),
            stashList: vi.fn(async () => []),
        };
        const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
        const view = makeWebviewView();
        (provider as any).view = view;

        await (provider as any).handleMessage({ type: 'acceptAllTheirs' });

        expect(calls).toEqual(['accept:a.txt', 'stage:a.txt', 'accept:b.txt', 'stage:b.txt']);
    });
});

describe('GraphViewProvider webview messages', () => {
    beforeEach(resetVscodeMock);

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

    it('keeps branch and path filters across refreshes', async () => {
        const service = {
            getGraphLog: vi.fn(async () => []),
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

        expect(service.getGraphLog).toHaveBeenNthCalledWith(1, 300, ['main'], 'src/index.ts');
        expect(service.getGraphLog).toHaveBeenNthCalledWith(2, 300, ['main'], 'src/index.ts');
    });
});
