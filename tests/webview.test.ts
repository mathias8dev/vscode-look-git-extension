// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphRow } from '../src/graphView/graphLaneAssigner';

interface MockVsCodeApi {
    messages: unknown[];
    state: unknown;
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

function installVsCodeApi(initialState: unknown = null): MockVsCodeApi {
    const api: MockVsCodeApi = {
        messages: [],
        state: initialState,
        postMessage(msg: unknown) {
            this.messages.push(msg);
        },
        getState() {
            return this.state;
        },
        setState(state: unknown) {
            this.state = state;
        },
    };
    (globalThis as any).acquireVsCodeApi = () => api;
    return api;
}

async function bootWebview(modulePath: string, initialState: unknown = null): Promise<MockVsCodeApi> {
    vi.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';
    const api = installVsCodeApi(initialState);
    await import(modulePath);
    return api;
}

function sendWebviewMessage(data: unknown): void {
    window.dispatchEvent(new MessageEvent('message', { data }));
}

function click(selector: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`Missing element: ${selector}`);
    }
    element.click();
}

function input(selector: string, value: string): void {
    const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (!element) {
        throw new Error(`Missing input: ${selector}`);
    }
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Changes webview runtime behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('individual file actions', () => {
        async function bootWithFiles(): Promise<MockVsCodeApi> {
            const api = await bootWebview('../src/webview/changes');
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.txt' }],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'unstaged.txt' }],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [],
                },
            });
            return api;
        }

        it('stage-btn posts stageFile for the clicked file', async () => {
            const api = await bootWithFiles();
            click('.stage-btn[data-file="unstaged.txt"]');
            expect(api.messages).toContainEqual({ type: 'stageFile', filePath: 'unstaged.txt' });
        });

        it('unstage-btn posts unstageFile for the clicked file', async () => {
            const api = await bootWithFiles();
            click('.unstage-btn[data-file="staged.txt"]');
            expect(api.messages).toContainEqual({ type: 'unstageFile', filePath: 'staged.txt' });
        });

        it('discard-btn posts discardFile for the clicked file', async () => {
            const api = await bootWithFiles();
            click('.discard-btn[data-file="unstaged.txt"]');
            expect(api.messages).toContainEqual({ type: 'discardFile', filePath: 'unstaged.txt' });
        });

        it('open-file-btn posts openFile for the clicked file', async () => {
            const api = await bootWithFiles();
            click('.open-file-btn[data-file="staged.txt"]');
            expect(api.messages).toContainEqual({ type: 'openFile', filePath: 'staged.txt' });
        });

        it('clicking staged file row posts openDiff with isStaged true', async () => {
            const api = await bootWithFiles();
            click('.file-row[data-file="staged.txt"]');
            expect(api.messages).toContainEqual({
                type: 'openDiff',
                filePath: 'staged.txt',
                origPath: undefined,
                isStaged: true,
                status: 'M',
            });
        });

        it('clicking unstaged file row posts openDiff with isStaged false', async () => {
            const api = await bootWithFiles();
            click('.file-row[data-file="unstaged.txt"]');
            expect(api.messages).toContainEqual({
                type: 'openDiff',
                filePath: 'unstaged.txt',
                origPath: undefined,
                isStaged: false,
                status: 'M',
            });
        });
    });

    it('boots, announces readiness, and keeps commit text after a failed commit', async () => {
        const api = await bootWebview('../src/webview/changes');

        expect(api.messages).toContainEqual({ type: 'ready' });
        expect(api.messages).toContainEqual({ type: 'viewModeChanged', asTree: false });

        sendWebviewMessage({
            type: 'statusData',
            data: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/file.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: 'none',
                stashes: [],
            },
        });
        input('#commit-message', 'keep this message');

        const commitButton = document.querySelector<HTMLButtonElement>('#commit-btn')!;
        expect(commitButton.disabled).toBe(false);
        commitButton.click();
        expect(api.messages).toContainEqual({
            type: 'commit',
            message: 'keep this message',
            mode: 'commit',
        });

        sendWebviewMessage({ type: 'commitResult', success: false });
        expect(document.querySelector<HTMLTextAreaElement>('#commit-message')!.value).toBe('keep this message');

        sendWebviewMessage({ type: 'commitResult', success: true });
        expect(document.querySelector<HTMLTextAreaElement>('#commit-message')!.value).toBe('');
    });

    it('posts predictable action messages for change and conflict controls', async () => {
        const api = await bootWebview('../src/webview/changes');
        sendWebviewMessage({
            type: 'statusData',
            data: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.txt' }],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'unstaged.txt' }],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.txt' }],
                conflictState: 'merge',
                stashes: [{ index: 0, message: 'stash message' }],
            },
        });

        click('#stage-all-btn');
        click('#unstage-all-btn');
        click('#discard-all-btn');
        click('#accept-all-theirs-btn');
        click('.conflict-file-row');
        click('[data-section="stashes"] .section-title-row');
        click('.stash-row');

        expect(api.messages).toContainEqual({ type: 'stageAll' });
        expect(api.messages).toContainEqual({ type: 'unstageAll' });
        expect(api.messages).toContainEqual({ type: 'discardAll' });
        expect(api.messages).toContainEqual({ type: 'acceptAllTheirs' });
        expect(api.messages).toContainEqual({ type: 'openMergeEditor', filePath: 'conflict.txt' });
        expect(api.messages).toContainEqual({ type: 'getStashFiles', index: 0 });
    });
});

function graphRow(hash: string, message: string): GraphRow {
    return {
        commit: {
            hash,
            shortHash: hash.substring(0, 7),
            message,
            authorName: 'Test User',
            authorEmail: 'test@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
            refs: [],
        },
        laneData: {
            lane: 0,
            color: '#f97583',
            lines: [],
        },
    };
}

describe('Graph webview runtime behavior', () => {
    it('filters, selects commits, opens details, and forwards parent-aware diff messages', async () => {
        const api = await bootWebview('../src/webview/graph');
        const rows = [
            graphRow('abc123456789', 'visible commit'),
            graphRow('def123456789', 'hidden commit'),
        ];

        expect(api.messages).toContainEqual({ type: 'ready' });

        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [],
                tags: [],
                rows,
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        input('#search-input', 'visible');
        expect([...document.querySelectorAll('.graph-row')]).toHaveLength(1);

        click('.graph-row');
        expect(api.messages).toContainEqual({ type: 'getCommitDetails', hash: 'abc123456789' });

        sendWebviewMessage({
            type: 'commitDetails',
            hash: 'abc123456789',
            fullMessage: 'visible commit\n\nbody',
            files: [{
                status: 'R',
                filePath: 'src/new.ts',
                origPath: 'src/old.ts',
                parentHash: 'parent123',
            }],
        });
        click('.file-item');

        expect(api.messages).toContainEqual({
            type: 'openDiff',
            filePath: 'src/new.ts',
            origPath: 'src/old.ts',
            parentHash: 'parent123',
            commitHash: 'abc123456789',
            status: 'R',
        });
    });

    it('sends selected branch and path filters back to the extension', async () => {
        const api = await bootWebview('../src/webview/graph');
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [{ name: 'feature/ui', isRemote: false, isCurrent: false, hash: 'abc1234' }],
                tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        click('[data-branch="feature/ui"]');
        expect(api.messages).toContainEqual({
            type: 'selectBranch',
            branches: ['feature/ui'],
            path: undefined,
        });

        click('[data-filter="paths"]');
        input('#filter-path-input', 'src/webview');
        click('#path-apply-btn');
        expect(api.messages).toContainEqual({
            type: 'selectBranch',
            branches: ['feature/ui'],
            path: 'src/webview',
        });
    });
});
