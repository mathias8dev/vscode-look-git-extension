// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphRow } from '../src/graphView/graphLaneAssigner';
import {
    GRAPH_WEBVIEW_MODULE,
    bootWebview,
    click,
    input,
    sendWebviewMessage,
    type MockVsCodeApi,
} from './helpers/webviewRuntime';

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
        expect(document.querySelector('.file-item[data-file="src/new.ts"] svg.file-icon[data-icon="typescript"]')).not.toBeNull();
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
        expect(document.querySelector('.file-tree-item[data-file="src/new.ts"] svg.file-icon[data-icon="typescript"]')).not.toBeNull();
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
                    { name: 'release/old', isRemote: false, isCurrent: false, hash: '789abcd', upstream: 'origin/release/old', ahead: 0, behind: 150 },
                    { name: 'origin/main', isRemote: true, isCurrent: false, hash: 'abc1234' },
                ],
                tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0,
                currentBranch: 'main',
                currentUser: 'Test User',
            },
        });

        click('.view-switch-btn[data-mode="list"]');
        const listCurrent = document.querySelector<HTMLElement>('.branch-item.current[data-branch="main"]');
        expect(listCurrent).not.toBeNull();
        expect(listCurrent?.querySelector('.current-branch-indicator')?.getAttribute('aria-label')).toBe('Current branch');
        expect(listCurrent?.querySelector('.branch-remote-pending-indicator')?.getAttribute('aria-label')).toBe('2 commits behind origin/main');
        expect(listCurrent?.querySelector('.branch-remote-pending-indicator')?.textContent?.trim()).toBe('2');
        const pendingIcon = listCurrent?.querySelector('.branch-remote-pending-indicator svg.branch-incoming-icon');
        expect(pendingIcon).not.toBeNull();
        expect(pendingIcon?.querySelectorAll('path').length).toBeGreaterThan(0);
        expect(pendingIcon?.getAttribute('stroke')).toBe('currentColor');
        expect(document.head.textContent).toContain('margin-left: calc(16px - var(--branch-row-gap, 6px))');
        expect(document.head.textContent).toContain('color: var(--vscode-icon-foreground, var(--vscode-foreground))');
        expect(document.head.textContent).toContain('.branch-item.active .branch-remote-pending-indicator { color: var(--vscode-list-activeSelectionForeground); }');
        expect(document.querySelector('.branch-item[data-branch="feature/ui"] .current-branch-indicator')).toBeNull();
        expect(document.querySelector('.branch-item[data-branch="feature/ui"] .branch-remote-pending-indicator')?.getAttribute('aria-label')).toBe('1 commit behind origin/feature/ui');
        expect(document.querySelector('.branch-item[data-branch="release/old"] .branch-remote-pending-indicator')?.textContent?.trim()).toBe('99+');
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
        click('[data-files-mode="list"]');

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

    describe('commit context menu commands', () => {
        function rightClick(selector: string): void {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) { throw new Error(`Missing element: ${selector}`); }
            element.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }),
            );
        }

        function modifiedClick(selector: string, modifiers: MouseEventInit = {}): void {
            const element = document.querySelector<HTMLElement>(selector);
            if (!element) { throw new Error(`Missing element: ${selector}`); }
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }));
        }

        function contextItems(): HTMLElement[] {
            return Array.from(document.querySelectorAll<HTMLElement>('.context-menu-item'));
        }

        function getContextItem(label: string): HTMLElement {
            const item = contextItems().find((el) => el.textContent === label);
            if (!item) { throw new Error(`Missing context menu item: "${label}"`); }
            return item;
        }

        function clickContextItem(label: string): void {
            getContextItem(label).click();
        }

        async function bootWithCommitGraph(): Promise<MockVsCodeApi> {
            const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
            const head = graphRow('head123456789', 'head commit');
            head.commit.parentHashes = ['mid123456789'];
            const mid = graphRow('mid123456789', 'middle commit');
            mid.commit.parentHashes = ['root123456789'];
            const side = graphRow('side123456789', 'side commit');
            side.commit.parentHashes = ['root123456789'];
            const root = graphRow('root123456789', 'root commit');
            const merge = graphRow('merge123456789', 'merge commit');
            merge.commit.parentHashes = ['head123456789', 'side123456789'];
            sendWebviewMessage({
                type: 'graphData',
                data: {
                    branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: 'head123' }],
                    tags: [],
                    rows: [merge, head, mid, side, root],
                    maxLane: 0,
                    currentBranch: 'main',
                    currentUser: 'Test User',
                    hasRemotes: true,
                    repositoryWebUrl: 'https://github.com/example/look-git',
                    currentBranchCommitHashes: ['head123456789', 'mid123456789', 'root123456789'],
                },
            });
            return api;
        }

        it('renders the non-AI graph commit actions and forwards command actions', async () => {
            const api = await bootWithCommitGraph();
            rightClick('.graph-row[data-hash="mid123456789"]');

            const labels = contextItems().map((item) => item.textContent);
            expect(labels).toContain('Copy Revision Number');
            expect(labels).toContain('Create Patch...');
            expect(labels).toContain('Show Repository at Revision');
            expect(labels).toContain('Compare with Local');
            expect(labels).toContain('Squash Into...');
            expect(labels).toContain('Interactively Rebase from Here...');
            expect(labels).toContain("Rebase 'main' onto Selected Commit");
            expect(labels).toContain('New Branch...');
            expect(labels).toContain('New Tag...');
            expect(labels).toContain('View in Browser');
            expect(labels).not.toContain('Self-Review with AI');
            expect(labels).not.toContain('Explain Commit with AI Assistant');

            clickContextItem('Create Patch...');
            expect(api.messages).toContainEqual({
                type: 'executeCommand',
                command: 'lookGit.createPatch',
                commitHash: 'mid123456789',
                commitHashes: ['mid123456789'],
            });
        });

        it('keeps tall context menus inside the viewport and makes them scrollable', async () => {
            const originalInnerHeight = window.innerHeight;
            const originalInnerWidth = window.innerWidth;
            const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
            const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
                    if (this.classList.contains('context-menu')) {
                        return {
                            x: 100,
                            y: 100,
                            left: 100,
                            top: 100,
                            width: 240,
                            height: 300,
                            right: 340,
                            bottom: 400,
                            toJSON: () => ({}),
                        } as DOMRect;
                    }
                    return {
                        x: 0,
                        y: 0,
                        left: 0,
                        top: 0,
                        width: 0,
                        height: 0,
                        right: 0,
                        bottom: 0,
                        toJSON: () => ({}),
                    } as DOMRect;
                });
            Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
                configurable: true,
                get() {
                    return this.classList.contains('context-menu') ? 300 : 0;
                },
            });

            Object.defineProperty(window, 'innerHeight', { configurable: true, value: 120 });
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 });

            try {
                await bootWithCommitGraph();
                rightClick('.graph-row[data-hash="mid123456789"]');

                const menu = document.querySelector<HTMLElement>('.context-menu')!;
                expect(menu.style.maxHeight).toBe('96px');
                expect(menu.style.overflowY).toBe('auto');
                expect(menu.style.top).toBe('4px');
                expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(4);

                menu.dispatchEvent(new Event('scroll', { bubbles: true }));
                expect(document.querySelector('.context-menu')).toBe(menu);

                document.getElementById('graph-pane')!.dispatchEvent(new Event('scroll', { bubbles: true }));
                expect(document.querySelector('.context-menu')).toBeNull();
            } finally {
                rectSpy.mockRestore();
                if (originalScrollHeight) {
                    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
                }
                Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
                Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
            }
        });

        it('selects individual commits with Ctrl or Command and ranges with Shift', async () => {
            const api = await bootWithCommitGraph();

            modifiedClick('.graph-row[data-hash="head123456789"]');
            expect(document.querySelector('.graph-row[data-hash="head123456789"]')?.classList.contains('selected')).toBe(true);

            modifiedClick('.graph-row[data-hash="root123456789"]', { ctrlKey: true });
            expect(document.querySelector('.graph-row[data-hash="head123456789"]')?.classList.contains('selected')).toBe(true);
            expect(document.querySelector('.graph-row[data-hash="root123456789"]')?.classList.contains('selected')).toBe(true);
            expect(document.querySelector('.graph-row[data-hash="mid123456789"]')?.classList.contains('selected')).toBe(false);

            rightClick('.graph-row[data-hash="root123456789"]');
            expect(getContextItem('Copy Revision Numbers').classList.contains('disabled')).toBe(false);
            clickContextItem('Copy Revision Numbers');
            expect(api.messages).toContainEqual({
                type: 'executeCommand',
                command: 'lookGit.copyCommitHash',
                commitHash: 'root123456789',
                commitHashes: ['head123456789', 'root123456789'],
            });

            modifiedClick('.graph-row[data-hash="head123456789"]');
            modifiedClick('.graph-row[data-hash="root123456789"]', { shiftKey: true });
            expect(document.querySelector('.graph-row[data-hash="head123456789"]')?.classList.contains('selected')).toBe(true);
            expect(document.querySelector('.graph-row[data-hash="mid123456789"]')?.classList.contains('selected')).toBe(true);
            expect(document.querySelector('.graph-row[data-hash="root123456789"]')?.classList.contains('selected')).toBe(true);

            api.messages.length = 0;
            modifiedClick('.graph-row[data-hash="mid123456789"]');
            modifiedClick('.graph-row[data-hash="root123456789"]', { metaKey: true });
            rightClick('.graph-row[data-hash="root123456789"]');
            expect(getContextItem('Create Patches...').classList.contains('disabled')).toBe(false);
            expect(getContextItem('Reset Current Branch to Here...').classList.contains('disabled')).toBe(true);
            clickContextItem('Create Patches...');
            expect(api.messages).toContainEqual({
                type: 'executeCommand',
                command: 'lookGit.createPatch',
                commitHash: 'root123456789',
                commitHashes: ['mid123456789', 'root123456789'],
            });

            rightClick('.graph-row[data-hash="root123456789"]');
            clickContextItem('Revert Commits');
            expect(api.messages).toContainEqual({
                type: 'executeCommand',
                command: 'lookGit.revert',
                commitHash: 'root123456789',
                commitHashes: ['mid123456789', 'root123456789'],
            });
        });

        it('disables context actions that cannot run for the selected commit', async () => {
            const api = await bootWithCommitGraph();

            rightClick('.graph-row[data-hash="head123456789"]');
            expect(getContextItem('Undo Commit...').classList.contains('disabled')).toBe(false);
            expect(getContextItem('Cherry-Pick').classList.contains('disabled')).toBe(true);
            api.messages.length = 0;
            getContextItem('Cherry-Pick').click();
            expect(api.messages).toEqual([]);

            rightClick('.graph-row[data-hash="root123456789"]');
            expect(getContextItem('Undo Commit...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Fixup...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Go to Parent Commit').classList.contains('disabled')).toBe(true);

            rightClick('.graph-row[data-hash="merge123456789"]');
            expect(getContextItem('Revert Commit').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Edit Commit Message...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Interactively Rebase from Here...').classList.contains('disabled')).toBe(true);
        });

        it('disables branch-rewrite actions for commits outside the current branch', async () => {
            await bootWithCommitGraph();

            rightClick('.graph-row[data-hash="side123456789"]');

            expect(getContextItem('Cherry-Pick').classList.contains('disabled')).toBe(false);
            expect(getContextItem('Create Patch...').classList.contains('disabled')).toBe(false);
            expect(getContextItem('Edit Commit Message...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Fixup...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Squash Into...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Drop Commits...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Interactively Rebase from Here...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Push All up to Here...').classList.contains('disabled')).toBe(true);
        });

        it('disables squash for non-consecutive current branch selections', async () => {
            await bootWithCommitGraph();

            modifiedClick('.graph-row[data-hash="head123456789"]');
            modifiedClick('.graph-row[data-hash="root123456789"]', { ctrlKey: true });
            rightClick('.graph-row[data-hash="root123456789"]');

            expect(getContextItem('Squash Commits...').classList.contains('disabled')).toBe(true);
            expect(getContextItem('Drop Commits...').classList.contains('disabled')).toBe(false);
        });

        it('navigates to loaded parent and child commits from the context menu', async () => {
            const api = await bootWithCommitGraph();

            rightClick('.graph-row[data-hash="mid123456789"]');
            clickContextItem('Go to Parent Commit');
            expect(api.messages).toContainEqual({ type: 'getCommitDetails', hash: 'root123456789' });
            expect(document.querySelector('.graph-row[data-hash="root123456789"]')?.classList.contains('selected')).toBe(true);

            api.messages.length = 0;
            rightClick('.graph-row[data-hash="mid123456789"]');
            clickContextItem('Go to Child Commit');
            expect(api.messages).toContainEqual({ type: 'getCommitDetails', hash: 'head123456789' });
            expect(document.querySelector('.graph-row[data-hash="head123456789"]')?.classList.contains('selected')).toBe(true);
        });
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

describe('Graph webview worktree support', () => {
    function baseGraphData(overrides = {}) {
        return {
            branches: [],
            tags: [],
            rows: [],
            maxLane: 0,
            currentBranch: 'main',
            currentUser: 'Test User',
            worktrees: [],
            ...overrides,
        };
    }

    it('renders a WORKTREES section when non-main worktrees are present', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                worktrees: [
                    { path: '/main', head: 'abc', branch: 'refs/heads/main', isMain: true, isDetached: false },
                    { path: '/wt/feature', head: 'def', branch: 'refs/heads/feature', isMain: false, isDetached: false },
                ],
            }),
        });
        expect(document.querySelector('.worktree-item')).not.toBeNull();
        expect(document.querySelector('.worktree-item')!.textContent).toContain('feature');
    });

    it('derives branch name from refs/heads/ prefix', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                worktrees: [
                    { path: '/main', head: 'a', branch: 'refs/heads/main', isMain: true, isDetached: false },
                    { path: '/wt', head: 'b', branch: 'refs/heads/feat/some-feature', isMain: false, isDetached: false },
                ],
            }),
        });
        expect(document.querySelector('.worktree-item')!.textContent).toContain('feat/some-feature');
    });

    it('shows detached label when worktree has no branch', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                worktrees: [
                    { path: '/main', head: 'aaa', branch: 'refs/heads/main', isMain: true, isDetached: false },
                    { path: '/wt', head: 'abc1234', branch: undefined, isMain: false, isDetached: true },
                ],
            }),
        });
        expect(document.querySelector('.worktree-item')!.textContent).toContain('detached');
        expect(document.querySelector('.worktree-item')!.textContent).toContain('abc1234');
    });

    it('does not render WORKTREES section when only main worktree exists', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                worktrees: [
                    { path: '/main', head: 'abc', branch: 'refs/heads/main', isMain: true, isDetached: false },
                ],
            }),
        });
        expect(document.querySelector('.worktree-item')).toBeNull();
    });

    it('clicking worktree item posts executeWorktreeCommand open', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                worktrees: [
                    { path: '/main', head: 'a', branch: 'refs/heads/main', isMain: true, isDetached: false },
                    { path: '/wt/feature', head: 'b', branch: 'refs/heads/feature', isMain: false, isDetached: false },
                ],
            }),
        });
        click('.worktree-item');
        expect(api.messages).toContainEqual({
            type: 'executeWorktreeCommand',
            command: 'open',
            path: '/wt/feature',
        });
    });

    it('renders worktree WT badge on commit row when that commit is checked out in a worktree', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                rows: [graphRow('abc123456789', 'commit in worktree')],
                worktrees: [
                    { path: '/main', head: 'other', branch: 'refs/heads/main', isMain: true, isDetached: false },
                    { path: '/wt', head: 'abc123456789', branch: 'refs/heads/feature', isMain: false, isDetached: false },
                ],
            }),
        });
        const row = document.querySelector('.graph-row[data-hash="abc123456789"]');
        expect(row?.querySelector('.worktree-badge')).not.toBeNull();
    });

    it('does not render WT badge on commit rows not checked out in a worktree', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: baseGraphData({
                rows: [graphRow('abc123456789', 'regular commit')],
                worktrees: [
                    { path: '/main', head: 'other', branch: 'refs/heads/main', isMain: true, isDetached: false },
                ],
            }),
        });
        const row = document.querySelector('.graph-row[data-hash="abc123456789"]');
        expect(row?.querySelector('.worktree-badge')).toBeNull();
    });
});

describe('Graph webview submodule in commit details', () => {
    it('submodule file item does not trigger openDiff when clicked', async () => {
        const api = await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [], tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0, currentBranch: 'main', currentUser: 'Test',
                worktrees: [],
            },
        });
        click('.graph-row[data-hash="abc123456789"]');

        sendWebviewMessage({
            type: 'commitDetails',
            hash: 'abc123456789',
            fullMessage: 'commit',
            files: [
                { status: 'M', filePath: 'modules/child', isSubmodule: true },
                { status: 'M', filePath: 'src/file.ts', isSubmodule: false },
            ],
        });

        const submoduleItem = document.querySelector('.file-item[data-file="modules/child"]') as HTMLElement;
        const regularItem = document.querySelector('.file-item[data-file="src/file.ts"]') as HTMLElement;
        expect(submoduleItem).not.toBeNull();
        expect(regularItem).not.toBeNull();

        // Clicking submodule must NOT post openDiff
        const before = api.messages.length;
        submoduleItem.click();
        expect(api.messages.length).toBe(before);

        // Clicking regular file must post openDiff
        regularItem.click();
        expect(api.messages).toContainEqual(expect.objectContaining({ type: 'openDiff', filePath: 'src/file.ts' }));
    });

    it('submodule file item carries data-submodule attribute', async () => {
        await bootWebview(GRAPH_WEBVIEW_MODULE);
        sendWebviewMessage({
            type: 'graphData',
            data: {
                branches: [], tags: [],
                rows: [graphRow('abc123456789', 'commit')],
                maxLane: 0, currentBranch: 'main', currentUser: 'Test',
                worktrees: [],
            },
        });
        click('.graph-row[data-hash="abc123456789"]');

        sendWebviewMessage({
            type: 'commitDetails',
            hash: 'abc123456789',
            fullMessage: 'commit',
            files: [{ status: 'M', filePath: 'modules/child', isSubmodule: true }],
        });

        const item = document.querySelector('.file-item[data-file="modules/child"]') as HTMLElement;
        expect(item?.dataset.submodule).toBe('true');
    });
});
