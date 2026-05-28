// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANGES_WEBVIEW_MODULE, bootWebview, click, input, sendWebviewMessage, type MockVsCodeApi } from './helpers/webviewRuntime';

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

        it('renders extension-aware file icons in the list view', async () => {
            await bootWebview(CHANGES_WEBVIEW_MODULE);
            sendWebviewMessage({ type: 'setViewMode', asTree: false });
            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/index.ts' }],
                    unstaged: [],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [],
                },
            });

            expect(document.querySelector('.file-row[data-file="src/index.ts"] svg.file-icon text')?.textContent).toBe('TS');
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

        it('renders extension-aware file icons for conflicts', () => {
            expect(document.querySelector('.conflict-file-row[data-file="conflict.txt"] svg.file-icon text')?.textContent).toBe('F');
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
            expect(document.querySelector('.stash-file-row[data-file="stashed.ts"] svg.file-icon text')?.textContent).toBe('TS');
        });

        it('clears expanded stash file cache when the stash list changes', async () => {
            const api = await bootWithStash();
            click('[data-section="stashes"] .section-title-row');
            click('.stash-expand-btn[data-stash-index="0"]');

            sendWebviewMessage({
                type: 'stashFiles',
                index: 0,
                files: [{ status: 'M', filePath: 'old-stash.ts' }],
            });
            expect(document.querySelector('.stash-file-row[data-file="old-stash.ts"]')).not.toBeNull();

            sendWebviewMessage({
                type: 'statusData',
                data: {
                    staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.txt' }],
                    unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'unstaged.txt' }],
                    conflicts: [],
                    conflictState: 'none',
                    stashes: [{ index: 0, message: 'new stash at same index' }],
                },
            });

            expect(document.querySelector('.stash-file-row[data-file="old-stash.ts"]')).toBeNull();
            const previousRequests = api.messages.filter((message) =>
                typeof message === 'object'
                && message !== null
                && (message as { type?: unknown }).type === 'getStashFiles'
            ).length;

            click('.stash-expand-btn[data-stash-index="0"]');

            const nextRequests = api.messages.filter((message) =>
                typeof message === 'object'
                && message !== null
                && (message as { type?: unknown }).type === 'getStashFiles'
            ).length;
            expect(nextRequests).toBe(previousRequests + 1);
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
            expect(document.querySelector('.tree-file-row[data-file="src/commands/index.ts"] svg.file-icon text')?.textContent).toBe('TS');
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
        expect(api.messages).toContainEqual({ type: 'viewModeChanged', asTree: true });

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
        sendWebviewMessage({ type: 'setViewMode', asTree: false });
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
