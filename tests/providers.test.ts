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
