import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChangesViewProvider } from '../src/changesView/changesProvider';
import { CommitHistoryProvider } from '../src/commitHistoryProvider';
import { LoadMoreItem } from '../src/commitItem';
import { GraphViewProvider } from '../src/graphView/graphPanel';
import type { GitCommitInfo, GitStatusEntry } from '../src/gitService';

function resetVscodeMock(): void {
    (vscode.commands as any).reset();
    (vscode.window as any).reset();
    (vscode.workspace as any).reset?.();
}

function makeWebviewView() {
    const messages: unknown[] = [];
    let messageHandler: ((msg: unknown) => unknown) | undefined;
    let visibilityHandler: (() => unknown) | undefined;
    return {
        messages,
        get messageHandler() {
            return messageHandler;
        },
        get visibilityHandler() {
            return visibilityHandler;
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
        onDidChangeVisibility: vi.fn((handler: () => unknown) => {
            visibilityHandler = handler;
            return { dispose: vi.fn() };
        }),
    };
}

function statusEntry(filePath: string): GitStatusEntry {
    return { indexStatus: 'M', workTreeStatus: 'M', filePath };
}

describe('ChangesViewProvider webview messages', () => {
    beforeEach(resetVscodeMock);

    describe('webview lifecycle', () => {
        it('resolveWebviewView wires the real webview contract and publishes initial status data', async () => {
            const service = {
                getStatus: vi.fn(async () => ({
                    staged: [statusEntry('staged.ts')],
                    unstaged: [statusEntry('unstaged.ts')],
                    conflicts: [],
                    conflictState: 'none',
                })),
                stashList: vi.fn(async () => [{ index: 0, message: 'wip' }]),
            };
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();

            provider.resolveWebviewView(view as any, {} as any, {} as any);

            expect(view.webview.options).toEqual({
                enableScripts: true,
                localResourceRoots: [expect.objectContaining({ path: '/ext/dist/webview' })],
            });
            expect(view.webview.html).toContain('Content-Security-Policy');
            expect(view.webview.html).toContain('dist/webview/changes.js');
            expect(view.webview.html).toMatch(/script-src 'nonce-[^']+'/);
            expect(view.messageHandler).toEqual(expect.any(Function));

            await vi.waitFor(() => {
                expect(view.messages).toContainEqual({
                    type: 'statusData',
                    data: {
                        staged: [statusEntry('staged.ts')],
                        unstaged: [statusEntry('unstaged.ts')],
                        conflicts: [],
                        conflictState: 'none',
                        stashes: [{ index: 0, message: 'wip' }],
                    },
                });
            });
            expect(view.badge).toEqual({ value: 2, tooltip: '2 changes' });
        });

        it('defers expensive status refresh work while the changes webview is hidden', async () => {
            const service = {
                getStatus: vi.fn(async () => ({
                    staged: [],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
            };
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            const view = makeWebviewView();
            view.visible = false;

            provider.resolveWebviewView(view as any, {} as any, {} as any);
            await Promise.resolve();

            expect(service.getStatus).not.toHaveBeenCalled();
            expect(service.stashList).not.toHaveBeenCalled();

            view.visible = true;
            view.visibilityHandler?.();

            await vi.waitFor(() => expect(service.getStatus).toHaveBeenCalledTimes(1));
            expect(service.stashList).toHaveBeenCalledTimes(1);
        });
    });

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

    describe('openFile, openMergeEditor, continueOp, viewModeChanged', () => {
        function makeBaseService(overrides: Record<string, unknown> = {}) {
            return {
                getWorkingDirectory: vi.fn(() => '/workspace'),
                mergeContinue: vi.fn(async () => ''),
                rebaseContinue: vi.fn(async () => ''),
                getStatus: vi.fn(async () => ({
                    staged: [], unstaged: [], conflicts: [], conflictState: 'none',
                })),
                stashList: vi.fn(async () => []),
                ...overrides,
            };
        }

        it('openFile executes vscode.open with the resolved file URI', async () => {
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'openFile', filePath: 'src/file.ts' });
            const call = (vscode.commands as any).calls.find((c: any) => c.command === 'vscode.open');
            expect(call).toBeDefined();
            expect(call.args[0].path).toContain('src/file.ts');
        });

        it('openMergeEditor executes merge-conflict.accept.select', async () => {
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'openMergeEditor', filePath: 'conflict.txt' });
            expect((vscode.commands as any).calls[0].command).toBe('merge-conflict.accept.select');
        });

        it('openMergeEditor falls back to opening the file when the merge command is unavailable', async () => {
            (vscode.commands as any).failCommand(
                'merge-conflict.accept.select',
                new Error('command not found'),
            );
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();

            await (provider as any).handleMessage({ type: 'openMergeEditor', filePath: 'conflict.txt' });

            expect((vscode.commands as any).calls.map((c: any) => c.command)).toEqual([
                'merge-conflict.accept.select',
                'vscode.open',
            ]);
        });

        it('continueOp merge calls service.mergeContinue and shows info', async () => {
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'continueOp', conflictState: 'merge' });
            expect(service.mergeContinue).toHaveBeenCalled();
            expect((vscode.window as any).infoMessages).toContainEqual('Merge completed.');
        });

        it('continueOp rebase calls service.rebaseContinue and shows info', async () => {
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'continueOp', conflictState: 'rebase' });
            expect(service.rebaseContinue).toHaveBeenCalled();
            expect((vscode.window as any).infoMessages).toContainEqual('Rebase step completed.');
        });

        it('viewModeChanged asTree:true sets lookGit.viewAsTree context key', async () => {
            const service = makeBaseService();
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'viewModeChanged', asTree: true });
            expect((vscode.commands as any).calls).toContainEqual({
                command: 'setContext',
                args: ['lookGit.viewAsTree', true],
            });
        });

        it('git error shows generic error message', async () => {
            const service = makeBaseService({
                mergeContinue: vi.fn(async () => { throw new Error('merge failed'); }),
            });
            const provider = new ChangesViewProvider(vscode.Uri.file('/ext') as any, service as any);
            (provider as any).view = makeWebviewView();
            await (provider as any).handleMessage({ type: 'continueOp', conflictState: 'merge' });
            expect((vscode.window as any).errorMessages[0]).toContain('Git operation failed:');
            expect((vscode.window as any).errorMessages[0]).toContain('merge failed');
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

describe('CommitHistoryProvider pagination', () => {
    beforeEach(resetVscodeMock);

    function commit(index: number): GitCommitInfo {
        const hash = index.toString(16).padStart(40, '0');
        return {
            hash,
            shortHash: hash.substring(0, 7),
            message: `commit ${index}`,
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
        };
    }

    it('loads the next page when VS Code resolves the load-more tree item', async () => {
        const commits = Array.from({ length: 75 }, (_, index) => commit(index));
        const service = {
            getLog: vi.fn(async (limit: number, skip: number) => commits.slice(skip, skip + limit)),
            getCommitFiles: vi.fn(async () => []),
            getWorkingDirectory: vi.fn(() => '/workspace'),
        };
        const provider = new CommitHistoryProvider(service as any);

        const initialItems = await provider.getChildren();
        const loadMoreItem = initialItems.at(-1);

        expect(service.getLog).toHaveBeenCalledWith(50, 0);
        expect(initialItems).toHaveLength(51);
        expect(loadMoreItem).toBeInstanceOf(LoadMoreItem);

        provider.resolveTreeItem(loadMoreItem as any, loadMoreItem as any, {} as any);
        provider.resolveTreeItem(loadMoreItem as any, loadMoreItem as any, {} as any);

        await vi.waitFor(() => expect(service.getLog).toHaveBeenCalledTimes(2));
        expect(service.getLog).toHaveBeenNthCalledWith(2, 50, 50);

        const allItems = await provider.getChildren();
        expect(allItems).toHaveLength(75);
        expect(allItems.some((item) => item instanceof LoadMoreItem)).toBe(false);
    });
});

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
