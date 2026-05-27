// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphRow } from '../src/graphView/graphLaneAssigner';

const CHANGES_WEBVIEW_MODULE = '../dist/webview/changes.js';
const GRAPH_WEBVIEW_MODULE = '../dist/webview/graph.js';

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
            const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
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

    describe('per-file conflict actions', () => {
        let api: MockVsCodeApi;

        beforeEach(async () => {
            api = await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.txt' }],
                    conflictState: 'merge',
                    stashes: [],
                },
            });
        });

        it('accept-ours-btn posts acceptOurs with filePath', () => {
            click('.accept-ours-btn[data-file="conflict.txt"]');
            expect(api.messages).toContainEqual({ type: 'acceptOurs', filePath: 'conflict.txt' });
        });

        it('accept-theirs-btn posts acceptTheirs with filePath', () => {
            click('.accept-theirs-btn[data-file="conflict.txt"]');
            expect(api.messages).toContainEqual({ type: 'acceptTheirs', filePath: 'conflict.txt' });
        });

        it('mark-resolved-btn posts markResolved with filePath', () => {
            click('.mark-resolved-btn[data-file="conflict.txt"]');
            expect(api.messages).toContainEqual({ type: 'markResolved', filePath: 'conflict.txt' });
        });

        it('clicking a conflict row opens only the merge editor action', () => {
            api.messages.length = 0;

            click('.conflict-file-row[data-file="conflict.txt"]');

            expect(api.messages).toEqual([{ type: 'openMergeEditor', filePath: 'conflict.txt' }]);
        });
    });

    describe('merge and rebase controls', () => {
        async function bootWithConflict(conflictState: 'merge' | 'rebase'): Promise<MockVsCodeApi> {
            const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [],
                    unstaged: [],
                    conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.txt' }],
                    conflictState,
                    stashes: [],
                },
            });
            return api;
        }

        it('continue button posts continueOp with conflictState merge', async () => {
            const api = await bootWithConflict('merge');
            click('#continue-op-btn');
            expect(api.messages).toContainEqual({ type: 'continueOp', conflictState: 'merge' });
        });

        it('abort button posts abortOp with conflictState merge', async () => {
            const api = await bootWithConflict('merge');
            click('#abort-op-btn');
            expect(api.messages).toContainEqual({ type: 'abortOp', conflictState: 'merge' });
        });

        it('continue button posts continueOp with conflictState rebase', async () => {
            const api = await bootWithConflict('rebase');
            click('#continue-op-btn');
            expect(api.messages).toContainEqual({ type: 'continueOp', conflictState: 'rebase' });
        });

        it('abort button posts abortOp with conflictState rebase', async () => {
            const api = await bootWithConflict('rebase');
            click('#abort-op-btn');
            expect(api.messages).toContainEqual({ type: 'abortOp', conflictState: 'rebase' });
        });
    });

    describe('stash operations', () => {
        async function bootWithStash(): Promise<MockVsCodeApi> {
            const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.txt' }],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'unstaged.txt' }],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [{ index: 0, message: 'my stash' }],
                },
            });
            return api;
        }

        it('stash-btn posts stash', async () => {
            const api = await bootWithStash();
            expect(document.querySelector('#stash-btn')?.closest('[data-section="unstaged"]')).not.toBeNull();
            click('#stash-btn');
            expect(api.messages).toContainEqual({ type: 'stash' });
        });

        it('stash-staged-btn posts stashStaged', async () => {
            const api = await bootWithStash();
            click('#stash-staged-btn');
            expect(api.messages).toContainEqual({ type: 'stashStaged' });
        });

        it('stash-pop-btn posts stashPop with index', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-pop-btn[data-index="0"]');
            expect(api.messages).toContainEqual({ type: 'stashPop', index: 0 });
        });

        it('stash-apply-btn posts stashApply with index', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-apply-btn[data-index="0"]');
            expect(api.messages).toContainEqual({ type: 'stashApply', index: 0 });
        });

        it('stash-drop-btn posts stashDrop with index', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-drop-btn[data-index="0"]');
            expect(api.messages).toContainEqual({ type: 'stashDrop', index: 0 });
        });

        it('expanding stash row then receiving stashFiles renders file rows', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-expand-btn[data-stash-index="0"]');
            expect(api.messages).toContainEqual({ type: 'getStashFiles', index: 0 });

            sendWebviewMessage({
                type: 'stashFiles',
                index: 0,
                files: [{ status: 'M', filePath: 'stashed.ts' }],
            });

            expect(document.querySelectorAll('.stash-file-row').length).toBeGreaterThan(0);
        });

        it('clicking stash file row posts openStashDiff', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-expand-btn[data-stash-index="0"]');
            sendWebviewMessage({
                type: 'stashFiles',
                index: 0,
                files: [{ status: 'M', filePath: 'stashed.ts' }],
            });
            click('.stash-file-row[data-file="stashed.ts"]');
            expect(api.messages).toContainEqual({
                type: 'openStashDiff',
                filePath: 'stashed.ts',
                origPath: undefined,
                index: 0,
                status: 'M',
            });
        });
    });

    describe('commit mode and keyboard', () => {
        async function bootWithStagedFile(): Promise<MockVsCodeApi> {
            const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.txt' }],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [],
                },
            });
            return api;
        }

        it('clicking dropdown button reveals commit mode items', async () => {
            await bootWithStagedFile();
            click('#commit-dropdown-btn');
            const dropdown = document.querySelector<HTMLElement>('#commit-dropdown')!;
            expect(dropdown.style.display).not.toBe('none');
            expect(document.querySelectorAll('.dropdown-item').length).toBeGreaterThan(0);
        });

        it('selecting amend mode updates the commit label', async () => {
            await bootWithStagedFile();
            click('#commit-dropdown-btn');
            click('.dropdown-item[data-mode="amend"]');
            expect(document.querySelector('#commit-label')!.textContent).toBe('Commit (Amend)');
        });

        it('commit in amend mode posts mode amend', async () => {
            const api = await bootWithStagedFile();
            click('#commit-dropdown-btn');
            click('.dropdown-item[data-mode="amend"]');
            input('#commit-message', 'amend this');
            click('#commit-btn');
            expect(api.messages).toContainEqual({ type: 'commit', message: 'amend this', mode: 'amend' });
        });

        it('commit in commitPush mode posts mode commitPush', async () => {
            const api = await bootWithStagedFile();
            click('#commit-dropdown-btn');
            click('.dropdown-item[data-mode="commitPush"]');
            input('#commit-message', 'push it');
            click('#commit-btn');
            expect(api.messages).toContainEqual({ type: 'commit', message: 'push it', mode: 'commitPush' });
        });

        it('commit in commitSync mode posts mode commitSync', async () => {
            const api = await bootWithStagedFile();
            click('#commit-dropdown-btn');
            click('.dropdown-item[data-mode="commitSync"]');
            input('#commit-message', 'sync it');
            click('#commit-btn');
            expect(api.messages).toContainEqual({ type: 'commit', message: 'sync it', mode: 'commitSync' });
        });

        it('Ctrl+Enter on commit textarea submits the commit', async () => {
            const api = await bootWithStagedFile();
            input('#commit-message', 'shortcut commit');
            const textarea = document.querySelector<HTMLTextAreaElement>('#commit-message')!;
            textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
            expect(api.messages).toContainEqual({ type: 'commit', message: 'shortcut commit', mode: 'commit' });
        });

        it('commit-btn is disabled when no staged files', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'file.txt' }],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [],
                },
            });
            input('#commit-message', 'something');
            expect(document.querySelector<HTMLButtonElement>('#commit-btn')!.disabled).toBe(true);
        });

        it('commit-btn is disabled when message is empty even with staged files', async () => {
            await bootWithStagedFile();
            expect(document.querySelector<HTMLButtonElement>('#commit-btn')!.disabled).toBe(true);
        });
    });

    describe('tree view mode', () => {
        const NESTED_STATUS_DATA = {
            type: 'statusData',
            data: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/commands/index.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: 'none',
                stashes: [],
            },
        };

        it('renders tree-folder-row elements for nested file paths', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: true });
            sendWebviewMessage(NESTED_STATUS_DATA);
            expect(document.querySelectorAll('.tree-folder-row').length).toBeGreaterThan(0);
        });

        it('tree folder is collapsed by default — no tree-file-row initially', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: true });
            sendWebviewMessage(NESTED_STATUS_DATA);
            expect(document.querySelectorAll('.tree-file-row').length).toBe(0);
        });

        it('clicking tree-folder-row expands to show tree-file-row', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: true });
            sendWebviewMessage(NESTED_STATUS_DATA);
            click('.tree-folder-row');
            expect(document.querySelectorAll('.tree-file-row').length).toBe(1);
        });

        it('clicking tree-folder-row twice collapses back', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: true });
            sendWebviewMessage(NESTED_STATUS_DATA);
            click('.tree-folder-row');
            click('.tree-folder-row');
            expect(document.querySelectorAll('.tree-file-row').length).toBe(0);
        });

        it('clicking tree-file-row posts openDiff', async () => {
            const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: true });
            sendWebviewMessage(NESTED_STATUS_DATA);
            click('.tree-folder-row');
            click('.tree-file-row[data-file="src/commands/index.ts"]');
            expect(api.messages).toContainEqual({
                type: 'openDiff',
                filePath: 'src/commands/index.ts',
                origPath: undefined,
                isStaged: true,
                status: 'M',
            });
        });
    });

    it('boots, announces readiness, and keeps commit text after a failed commit', async () => {
        const api = await bootWebview(CHANGES_WEBVIEW_MODULE);

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
        const api = await bootWebview(CHANGES_WEBVIEW_MODULE);
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
        click('.stash-expand-btn');

        expect(api.messages).toContainEqual({ type: 'stageAll' });
        expect(api.messages).toContainEqual({ type: 'unstageAll' });
        expect(api.messages).toContainEqual({ type: 'discardAll' });
        expect(api.messages).toContainEqual({ type: 'acceptAllTheirs' });
        expect(api.messages).toContainEqual({ type: 'openMergeEditor', filePath: 'conflict.txt' });
        expect(api.messages).toContainEqual({ type: 'getStashFiles', index: 0 });
    });

    it('renders untrusted file paths and stash messages as text instead of markup', async () => {
        await bootWebview(CHANGES_WEBVIEW_MODULE);
        const unsafePath = 'src/<img src=x onerror="alert(1)">.ts';
        const unsafeStash = '<script>alert("xss")</script>';

        sendWebviewMessage({
            type: 'statusData',
            data: {
                staged: [],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: unsafePath }],
                conflicts: [],
                conflictState: 'none',
                stashes: [{ index: 0, message: unsafeStash }],
            },
        });
        click('[data-section="stashes"] .section-title-row');

        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('#files-section')!.textContent).toContain('<img src=x onerror="alert(1)">.ts');
        expect(document.querySelector('#files-section')!.textContent).toContain(unsafeStash);
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
            isPrimary: false,
        },
    };
}

describe('Graph webview runtime behavior', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('filters, selects commits, opens details, and forwards parent-aware diff messages', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
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
        expect([...document.querySelectorAll('.graph-row')]).toHaveLength(2);
        expect(document.querySelector('.graph-row[data-hash="abc123456789"]')?.classList.contains('filter-matched')).toBe(true);
        expect(document.querySelector('.graph-row[data-hash="def123456789"]')?.classList.contains('filter-dimmed')).toBe(true);
        expect(document.querySelector('.graph-row .commit-graph-svg')).not.toBeNull();

        const renderedRow = document.querySelector('.graph-row[data-hash="abc123456789"]');
        expect(renderedRow?.querySelector('.commit-row-button')).not.toBeNull();
        click('.graph-row[data-hash="abc123456789"]');
        expect(document.querySelector('.graph-row[data-hash="abc123456789"]')).toBe(renderedRow);
        expect(renderedRow?.classList.contains('selected')).toBe(true);
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

        api.messages.length = 0;
        click('[data-files-mode="tree"]');
        click('.file-tree-item[data-file="src/new.ts"]');

        expect(api.messages).toContainEqual({
            type: 'openDiff',
            filePath: 'src/new.ts',
            origPath: 'src/old.ts',
            parentHash: 'parent123',
            commitHash: 'abc123456789',
            status: 'R',
        });
    });

    it('requests the next graph page when the scroll sentinel enters the viewport', async () => {
        const originalIntersectionObserver = (globalThis as any).IntersectionObserver;
        const observers: Array<{
            trigger(isIntersecting?: boolean): void;
        }> = [];

        class MockIntersectionObserver {
            private observed: Element | null = null;

            constructor(private callback: IntersectionObserverCallback) {
                observers.push(this);
            }

            observe(element: Element): void {
                this.observed = element;
            }

            disconnect(): void {
                this.observed = null;
            }

            unobserve(): void {
                this.observed = null;
            }

            trigger(isIntersecting = true): void {
                this.callback([{
                    isIntersecting,
                    target: this.observed,
                } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
            }
        }

        (globalThis as any).IntersectionObserver = MockIntersectionObserver;
        try {
            const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [],
                    tags: [],
                    rows: [graphRow('abc123456789', 'first page')],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Test User',
                    hasMore: true,
                    loadedCount: 1,
                },
            });

            expect(document.querySelector('#graph-scroll-sentinel')).not.toBeNull();
            expect(observers.length).toBeGreaterThan(0);
            const firstRenderedRow = document.querySelector('.graph-row');
            expect(firstRenderedRow).not.toBeNull();

            const currentObserver = observers.at(-1)!;
            currentObserver.trigger();
            currentObserver.trigger();
            expect(document.querySelector('#graph-loading-more')).not.toBeNull();
            expect(document.querySelector('#graph-scroll-sentinel')).toBeNull();
            expect(document.querySelector('.graph-row')).toBe(firstRenderedRow);

            expect(api.messages.filter((message) => (
                typeof message === 'object'
                && message !== null
                && (message as { type?: string }).type === 'loadMoreGraph'
            ))).toHaveLength(1);

            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [],
                    tags: [],
                    rows: [
                        graphRow('abc123456789', 'first page'),
                        graphRow('def123456789', 'second page'),
                    ],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Test User',
                    hasMore: false,
                    loadedCount: 2,
                },
            });

            expect(document.querySelector('#graph-scroll-sentinel')).toBeNull();
            expect(document.querySelector('#graph-loading-more')).toBeNull();
        } finally {
            (globalThis as any).IntersectionObserver = originalIntersectionObserver;
        }
    });

    it('does not render hover or path-highlight effects on graph rows', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
        const tip = graphRow('tip123456789', 'tip');
        tip.commit.parentHashes = ['parent123456789'];
        tip.laneData.lines = [{
            fromLane: 0,
            toLane: 0,
            color: '#f97583',
            type: 'straight',
            targetHash: 'parent123456789',
            role: 'first-parent',
        }];
        const parent = graphRow('parent123456789', 'parent');
        const side = graphRow('side123456789', 'side');
        side.laneData.lane = 1;
        side.laneData.color = '#79b8ff';
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [],
                tags: [],
                rows: [tip, side, parent],
                maxLane: 1,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        document.querySelector<HTMLElement>('.graph-row[data-hash="tip123456789"]')!.dispatchEvent(
            new MouseEvent('mouseenter', { bubbles: true }),
        );
        expect(document.head.textContent).not.toContain('.graph-row:hover');
        expect(document.head.textContent).not.toContain('graph-path-mode');

        click('.graph-row[data-hash="tip123456789"]');
        expect(api.messages).toContainEqual({ type: 'getCommitDetails', hash: 'tip123456789' });
        expect(document.querySelector('#graph-pane')?.classList.contains('graph-path-mode')).toBe(false);
        expect(document.querySelector('.graph-row[data-hash="tip123456789"]')?.classList.contains('selected')).toBe(true);
        expect(document.querySelector('.graph-row[data-hash="parent123456789"]')?.className).not.toContain('graph-path');
        expect(document.querySelector('.graph-row[data-hash="side123456789"]')?.className).not.toContain('graph-path');
    });

    it('sends selected branch and path filters back to the extension', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
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
        expect(document.querySelector('[data-filter="paths"]')?.tagName).toBe('BUTTON');
        input('#filter-path-input', 'src/webview');
        click('#path-apply-btn');
        expect(api.messages).toContainEqual({
            type: 'selectBranch',
            branches: ['feature/ui'],
            path: 'src/webview',
        });
    });

    it('sends search, user, and date filters back to the extension', async () => {
        vi.useFakeTimers();
        try {
            const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
            const alice = graphRow('abc123456789', 'target commit');
            alice.commit.authorName = 'Alice Search';
            const bob = graphRow('def123456789', 'other commit');
            bob.commit.authorName = 'Bob Search';
            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [],
                    tags: [],
                    rows: [alice, bob],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Alice Search',
                },
            });

            input('#search-input', 'target');
            vi.advanceTimersByTime(250);
            expect(api.messages).toContainEqual({
                type: 'selectBranch',
                branches: undefined,
                path: undefined,
                search: 'target',
            });

            click('[data-filter="date"]');
            document.querySelector<HTMLInputElement>('#filter-date-from')!.value = '2024-02-01';
            document.querySelector<HTMLInputElement>('#filter-date-to')!.value = '2024-02-02';
            click('#date-apply-btn');
            expect(api.messages).toContainEqual({
                type: 'selectBranch',
                branches: undefined,
                path: undefined,
                search: 'target',
                dateFrom: '2024-02-01',
                dateTo: '2024-02-02',
            });

            click('[data-filter="user"]');
            const bobCheckbox = document.querySelector<HTMLInputElement>('input[value="Bob Search"]')!;
            bobCheckbox.checked = true;
            bobCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            expect(api.messages).toContainEqual({
                type: 'selectBranch',
                branches: undefined,
                path: undefined,
                search: 'target',
                authors: ['Bob Search'],
                dateFrom: '2024-02-01',
                dateTo: '2024-02-02',
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it('escapes path filter values when reopening the path dropdown', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [],
                tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });
        const unsafePath = 'src/" /><img src=x onerror="bad">';

        click('[data-filter="paths"]');
        input('#filter-path-input', unsafePath);
        click('#path-apply-btn');
        click('[data-filter="paths"]');

        expect(document.querySelector<HTMLInputElement>('#filter-path-input')?.value).toBe(unsafePath);
        expect(document.querySelector('img')).toBeNull();
    });

    it('shows a visual indicator for the current branch in list and tree branch views', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [
                    { name: 'main', isRemote: false, isCurrent: true, hash: 'abc1234', upstream: 'origin/main', ahead: 0, behind: 2 },
                    { name: 'feature/ui', isRemote: false, isCurrent: false, hash: 'def1234', upstream: 'origin/feature/ui', ahead: 1, behind: 1 },
                    { name: 'origin/main', isRemote: true, isCurrent: false, hash: 'abc1234' },
                ],
                tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        const listCurrent = document.querySelector<HTMLElement>('.branch-item.current[data-branch="main"]');
        expect(listCurrent).not.toBeNull();
        expect(listCurrent?.querySelector('.current-branch-indicator')?.getAttribute('aria-label')).toBe('Current branch');
        expect(listCurrent?.querySelector('.branch-remote-pending-indicator')?.getAttribute('aria-label')).toBe('2 commits behind origin/main');
        expect(listCurrent?.querySelector('.branch-remote-pending-indicator')?.textContent?.trim()).toBe('');
        expect(listCurrent?.querySelector('.branch-remote-pending-indicator path')?.getAttribute('d')).toBe('M18 6L6 18M6 18L6 9M6 18L15 18');
        expect(document.head.textContent).toContain('.branch-remote-pending-indicator { width: 14px; height: 14px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 10px; }');
        expect(document.querySelector('.branch-item[data-branch="feature/ui"] .current-branch-indicator')).toBeNull();
        expect(document.querySelector('.branch-item[data-branch="feature/ui"] .branch-remote-pending-indicator')?.getAttribute('aria-label')).toBe('1 commit behind origin/feature/ui');
        expect(document.querySelector('.branch-item[data-branch="origin/main"] .branch-remote-pending-indicator')).toBeNull();

        click('.view-switch-btn[data-mode="tree"]');
        const treeCurrent = document.querySelector<HTMLElement>('.branch-item.tree-leaf.current[data-branch="main"]');
        expect(treeCurrent).not.toBeNull();
        expect(treeCurrent?.querySelector('.current-branch-indicator')).not.toBeNull();
        expect(treeCurrent?.querySelector('.branch-remote-pending-indicator')).not.toBeNull();
        expect(document.querySelector('.branch-item.tree-leaf[data-branch="feature/ui"] .branch-remote-pending-indicator')).not.toBeNull();
        expect(document.querySelector('.branch-tree-folder .tree-folder-icon')).not.toBeNull();
        expect(document.querySelector('.branch-tree-folder .tree-chevron-icon')).not.toBeNull();
    });

    it('renders untrusted graph data and commit details as text instead of markup', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
        const unsafeBranch = 'feature/<img src=x onerror="alert(1)">';
        const unsafeMessage = '<script>alert("commit")</script>';
        const row = graphRow('abc123456789', unsafeMessage);
        row.commit.authorName = '<img src=x onerror="author()">';

        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [{ name: unsafeBranch, isRemote: false, isCurrent: false, hash: 'abc1234' }],
                tags: [{ name: '<script>tag</script>', hash: 'abc1234' }],
                rows: [row],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: row.commit.authorName,
            },
        });

        click('.graph-row');
        expect(api.messages).toContainEqual({ type: 'getCommitDetails', hash: 'abc123456789' });
        sendWebviewMessage({
            type: 'commitDetails',
            hash: 'abc123456789',
            fullMessage: '<img src=x onerror="details()">',
            files: [{ status: 'M', filePath: 'src/<script>file</script>.ts' }],
        });

        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('script')).toBeNull();
        expect(document.querySelector('#branch-pane')!.textContent).toContain('<img src=x onerror="alert(1)">');
        expect(document.querySelector('#graph-pane')!.textContent).toContain(unsafeMessage);
        expect(document.querySelector('#details-pane')!.textContent).toContain('<img src=x onerror="details()">');
        expect(document.querySelector('#details-pane')!.textContent).toContain('src/<script>file</script>.ts');
    });

    it('clears commit details when refreshed graph data no longer contains the selected commit', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [],
                tags: [],
                rows: [graphRow('abc123456789', 'selected commit')],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });
        click('.graph-row');
        sendWebviewMessage({
            type: 'commitDetails',
            hash: 'abc123456789',
            fullMessage: 'selected commit',
            files: [{ status: 'M', filePath: 'src/file.ts' }],
        });
        expect(document.querySelector('#details-pane')!.textContent).toContain('Changed Files (1)');

        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [],
                tags: [],
                rows: [],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        expect(document.querySelector('#details-pane')!.classList.contains('empty')).toBe(true);
        expect(document.querySelector('#details-pane')!.textContent).toContain('Click a commit to view details');
    });

    describe('branch context menu commands', () => {
        function rightClick(selector: string): void {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) { throw new Error(`Missing element: ${selector}`); }
            element.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }),
            );
        }

        function clickContextItem(label: string): void {
            const items = Array.from(document.querySelectorAll<HTMLElement>('.context-menu-item'));
            const item = items.find((el) => el.textContent === label);
            if (!item) { throw new Error(`Missing context menu item: "${label}"`); }
            item.click();
        }

        async function bootWithLocalBranch(): Promise<MockVsCodeApi> {
            const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [{ name: 'feature/ui', isRemote: false, isCurrent: false, hash: 'abc1234' }],
                    tags: [],
                    rows: [],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Test User',
                },
            });
            return api;
        }

        it('checkout item posts executeBranchCommand checkout', async () => {
            const api = await bootWithLocalBranch();
            rightClick('.branch-item[data-branch="feature/ui"]');
            clickContextItem('Checkout');
            expect(api.messages).toContainEqual({
                type: 'executeBranchCommand',
                command: 'checkout',
                branch: 'feature/ui',
                isRemote: false,
            });
        });

        it('delete item posts executeBranchCommand delete', async () => {
            const api = await bootWithLocalBranch();
            rightClick('.branch-item[data-branch="feature/ui"]');
            clickContextItem('Delete');
            expect(api.messages).toContainEqual({
                type: 'executeBranchCommand',
                command: 'delete',
                branch: 'feature/ui',
                isRemote: false,
            });
        });

        it('rename item posts executeBranchCommand rename', async () => {
            const api = await bootWithLocalBranch();
            rightClick('.branch-item[data-branch="feature/ui"]');
            clickContextItem('Rename...');
            expect(api.messages).toContainEqual({
                type: 'executeBranchCommand',
                command: 'rename',
                branch: 'feature/ui',
                isRemote: false,
            });
        });

        it('executeBranchCommand for remote branch carries isRemote true', async () => {
            const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [{ name: 'origin/feature/ui', isRemote: true, isCurrent: false, hash: 'abc1234' }],
                    tags: [],
                    rows: [],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Test User',
                },
            });
            rightClick('.branch-item[data-branch="origin/feature/ui"]');
            clickContextItem('Checkout');
            expect(api.messages).toContainEqual({
                type: 'executeBranchCommand',
                command: 'checkout',
                branch: 'origin/feature/ui',
                isRemote: true,
            });
        });
    });
});
