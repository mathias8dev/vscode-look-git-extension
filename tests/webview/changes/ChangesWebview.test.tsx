// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictState, RepositoryState } from '../../../src/protocol/changes/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { createMockVsCodeApi, sendToWebview } from '../../helpers/webviewRuntime';

describe('ChangesWebview', () => {
    beforeEach(() => {
        vi.resetModules();
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('announces readiness without rendering a duplicate toolbar', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusData();

        await waitFor(() => expect(screen.getByLabelText('Repository changes')).toBeInTheDocument());

        expect(api.messages).toContainEqual({ type: 'changes/ready' });
        expect(api.messages).toContainEqual({ type: 'changes/preferencesChanged', viewMode: 'tree', sortMode: 'path' });
        expect(screen.queryByRole('heading', { level: 1, name: 'Changes' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Refresh Changes')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Open Git Graph')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More Actions')).not.toBeInTheDocument();
    });

    it('applies live Look Git font-size changes', async () => {
        createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendToWebview({ type: 'ui/fontSizeChanged', fontSize: 21 });

        await waitFor(() => expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('21px'));
        expect(document.documentElement.style.fontSize).toBe('21px');
        expect(document.body.style.fontSize).toBe('21px');
        expect(document.getElementById('root')?.style.fontSize).toBe('21px');
    });

    it('applies native view-title mode and commit-focus messages', async () => {
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusData();

        await waitFor(() => expect(screen.getByRole('button', { name: 'src' })).toBeInTheDocument());
        sendToWebview({ type: 'changes/applyViewMode', viewMode: 'list' });

        await waitFor(() => expect(screen.queryByRole('button', { name: 'src' })).not.toBeInTheDocument());
        expect(screen.getByTitle('src/app.ts')).toBeInTheDocument();

        sendToWebview({ type: 'changes/focusCommitComposer' });

        await waitFor(() => expect(screen.getByLabelText('Commit message')).toHaveFocus());
    });

    it('shows the current branch in the compact commit composer placeholder', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithStagedChange();

        const input = await screen.findByPlaceholderText('Message (Ctrl+Enter to commit on "experimental")');
        expect(screen.getByRole('button', { name: 'Commit' })).toBeInTheDocument();
        fireEvent.change(input, { target: { value: 'feat(changes): native commit menu' } });
        const moreButton = screen.getByRole('button', { name: 'More commit options' });
        expect(moreButton.getAttribute('data-vscode-context')).toContain('changesCommitComposer');
        fireEvent.click(moreButton);

        expect(api.messages).toContainEqual({
            type: 'changes/contextTarget',
            target: {
                kind: 'commitComposer',
                message: 'feat(changes): native commit menu',
            },
        });
        expect(screen.queryByRole('menuitem', { name: /Commit & Push/ })).not.toBeInTheDocument();
    });

    it('commits the compact composer message with Ctrl+Enter', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithStagedChange();

        const input = await screen.findByLabelText('Commit message');
        fireEvent.change(input, { target: { value: 'fix(changes): compact composer' } });
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        expect(api.messages).toContainEqual({
            type: 'changes/commit',
            message: 'fix(changes): compact composer',
            mode: 'commit',
        });
    });

    it('clears successful commit feedback after a short timeout', async () => {
        vi.useFakeTimers();
        try {
            createMockVsCodeApi();
            const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

            render(<ChangesWebview />);
            act(() => sendStatusDataWithStagedChange());
            expect(screen.getByLabelText('Commit message')).toBeInTheDocument();

            act(() => sendToWebview({ type: 'changes/commitResult', success: true }));
            expect(screen.getByText('Committed successfully.')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(4999);
            });
            expect(screen.getByText('Committed successfully.')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(screen.queryByText('Committed successfully.')).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('posts selected changes as a native context menu target', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithMultipleChanges();

        const first = await screen.findByTitle('src/a.ts');
        const second = await screen.findByTitle('src/b.ts');
        fireEvent.click(first, { ctrlKey: true });
        fireEvent.click(second, { ctrlKey: true });

        await waitFor(() => expect(second).toHaveAttribute('aria-selected', 'true'));
        expect(second.getAttribute('data-vscode-context')).toContain('changesSelection');
        expect(second.getAttribute('data-vscode-context')).toContain('changesSelectionCanStage');
        expect(second.getAttribute('data-vscode-context')).toContain('changesSelectionCanExplainDiff');
        expect(second.getAttribute('data-vscode-context')).toContain('changesSelectionCanCreatePatch');

        fireEvent.contextMenu(second);

        expect(api.messages).toContainEqual({
            type: 'changes/contextTarget',
            target: {
                kind: 'selection',
                filePaths: ['src/a.ts', 'src/b.ts'],
                stageFilePaths: ['src/a.ts', 'src/b.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/a.ts', 'src/b.ts'],
                stashFilePaths: ['src/a.ts', 'src/b.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/a.ts'],
                patchUntrackedFilePaths: ['src/b.ts'],
                stashIncludeUntracked: true,
            },
        });
    });

    it('posts review requests from changes and staged section bars only', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithReviewSections();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Review changes' })).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Review staged changes' }));

        expect(api.messages).toContainEqual({
            type: 'changes/explainSelection',
            target: {
                kind: 'selection',
                filePaths: ['src/app.ts', 'src/new.ts'],
                stageFilePaths: ['src/app.ts', 'src/new.ts'],
                unstageFilePaths: [],
                discardFilePaths: ['src/app.ts', 'src/new.ts'],
                stashFilePaths: ['src/app.ts', 'src/new.ts'],
                patchStagedFilePaths: [],
                patchUnstagedFilePaths: ['src/app.ts'],
                patchUntrackedFilePaths: ['src/new.ts'],
                stashIncludeUntracked: true,
            },
        });
        expect(api.messages).toContainEqual({
            type: 'changes/explainSelection',
            target: {
                kind: 'selection',
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
        expect(screen.queryByRole('button', { name: 'Review conflicts' })).not.toBeInTheDocument();
    });

    it('keeps expanded submodules open after parent status refreshes and reloads their details', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByText('lib')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));

        await waitFor(() => expect(submoduleStatusRequests(api.messages).length).toBe(1));
        sendToWebview({
            type: 'changes/submoduleStatusData',
            requestId: 'changes:submodule-status:modules/lib',
            path: 'modules/lib',
            data: {
                staged: [],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/inner.ts' }],
                conflicts: [],
                conflictState: ConflictState.None,
                stashes: [],
            },
        });

        await waitFor(() => expect(screen.getByTitle('src/inner.ts')).toBeInTheDocument());
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Hide changes' })).toBeInTheDocument());
        await waitFor(() => expect(submoduleStatusRequests(api.messages).length).toBe(2));
    });

    it('does not duplicate submodule status requests while a previous one is still loading', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByText('lib')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));

        await waitFor(() => expect(submoduleStatusRequests(api.messages).length).toBe(1));
        sendStatusDataWithSubmodule();
        await waitFor(() => expect(screen.getByText('Loading changes…')).toBeInTheDocument());
        await nextTick();

        expect(submoduleStatusRequests(api.messages).length).toBe(1);
    });

    it('keeps expanded stashes open after status refreshes and reloads missing files', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusData();

        await waitFor(() => expect(screen.getByText('WIP')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Show files' }));

        await waitFor(() => expect(stashFilesRequests(api.messages).length).toBe(1));
        sendStatusData();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Hide files' })).toBeInTheDocument());
        await waitFor(() => expect(stashFilesRequests(api.messages).length).toBe(2));
    });

    it('opens a stash file diff when clicking a loaded stash file row', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusData();

        await waitFor(() => expect(screen.getByText('WIP')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Show files' }));
        await waitFor(() => expect(stashFilesRequests(api.messages).length).toBe(1));
        sendToWebview({
            type: 'changes/stashFiles',
            requestId: 'changes:stash-files:0',
            index: 0,
            files: [{ status: 'M', filePath: 'src/stashed.ts' }],
        });

        await waitFor(() => expect(screen.getByTitle('src/stashed.ts')).toBeInTheDocument());
        fireEvent.click(screen.getByTitle('src/stashed.ts'));

        expect(api.messages).toContainEqual({
            type: 'changes/openStashDiff',
            index: 0,
            filePath: 'src/stashed.ts',
            origPath: undefined,
            status: 'M',
        });
    });

    it('requests and applies a generated commit message for staged changes', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithStagedChange();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Generate commit message' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: 'Generate commit message' }));

        const request = generatedCommitMessageRequest(api.messages);
        expect(request).toEqual(expect.objectContaining({
            type: 'changes/generateCommitMessage',
        }));

        sendToWebview({
            type: 'changes/generatedCommitMessage',
            requestId: request.requestId,
            message: 'fix(changes): generate commit messages',
        });

        await waitFor(() => expect(screen.getByLabelText('Commit message')).toHaveValue('fix(changes): generate commit messages'));
    });

    it('requests and applies a generated commit message inside a submodule composer', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByText('lib')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));
        await waitFor(() => expect(submoduleStatusRequests(api.messages).length).toBe(1));
        sendToWebview({
            type: 'changes/submoduleStatusData',
            requestId: 'changes:submodule-status:modules/lib',
            path: 'modules/lib',
            data: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/inner.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: ConflictState.None,
                currentBranch: 'feature/lib',
                stashes: [],
            },
        });

        await waitFor(() => expect(screen.getByTitle('src/inner.ts')).toBeInTheDocument());
        expect(screen.getByPlaceholderText('Message (Ctrl+Enter to commit on "feature/lib")')).toBeInTheDocument();
        const generateButton = enabledGenerateButton();
        fireEvent.click(generateButton);

        const request = generatedSubmoduleCommitMessageRequest(api.messages);
        expect(request.submodulePath).toBe('modules/lib');

        sendToWebview({
            type: 'changes/submoduleGeneratedCommitMessage',
            requestId: request.requestId,
            path: 'modules/lib',
            message: 'fix(lib): update inner module',
        });

        await waitFor(() => expect(screen.getByDisplayValue('fix(lib): update inner module')).toBeInTheDocument());
        fireEvent.click(screen.getAllByRole('button', { name: 'More commit options' })[1]);
        expect(api.messages).toContainEqual({
            type: 'changes/contextTarget',
            target: {
                kind: 'commitComposer',
                submodulePath: 'modules/lib',
                message: 'fix(lib): update inner module',
            },
        });
    });

    it('posts targeted submodule toolbar messages and native context targets from submodule header actions', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByText('lib')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Refresh submodule changes' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pull submodule' }));
        fireEvent.click(screen.getByRole('button', { name: 'Push submodule' }));
        fireEvent.click(screen.getByRole('button', { name: 'Review submodule changes' }));
        fireEvent.click(screen.getByRole('button', { name: 'More submodule actions' }));

        expect(api.messages).toContainEqual({
            type: 'changes/getSubmoduleStatus',
            requestId: 'changes:submodule-status:modules/lib',
            path: 'modules/lib',
        });
        expect(api.messages).toContainEqual({
            type: 'changes/submoduleToolbarCommand',
            submodulePath: 'modules/lib',
            command: 'pull',
        });
        expect(api.messages).toContainEqual({
            type: 'changes/submoduleToolbarCommand',
            submodulePath: 'modules/lib',
            command: 'push',
        });
        expect(api.messages).toContainEqual({
            type: 'changes/explainRepositoryChanges',
            submodulePath: 'modules/lib',
        });
        expect(api.messages).toContainEqual({
            type: 'changes/contextTarget',
            target: {
                kind: 'submoduleToolbar',
                submodulePath: 'modules/lib',
            },
        });
    });
});

function sendStatusData(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'main',
            staged: [],
            unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' }],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [{ index: 0, message: 'WIP' }],
            submodules: [],
        },
    });
}

function sendStatusDataWithSubmodule(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'main',
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
        },
    });
}

function sendStatusDataWithStagedChange(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'experimental',
            staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/app.ts' }],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        },
    });
}

function sendStatusDataWithMultipleChanges(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'main',
            staged: [],
            unstaged: [
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/a.ts' },
                { indexStatus: '?', workTreeStatus: '?', filePath: 'src/b.ts' },
            ],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        },
    });
}

function sendStatusDataWithReviewSections(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            currentBranch: 'main',
            staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'src/staged.ts' }],
            unstaged: [
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/app.ts' },
                { indexStatus: '?', workTreeStatus: '?', filePath: 'src/new.ts' },
            ],
            conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/conflict.ts' }],
            conflictState: ConflictState.Merge,
            stashes: [],
            submodules: [],
        },
    });
}

function generatedCommitMessageRequest(messages: readonly unknown[]): { readonly type: 'changes/generateCommitMessage'; readonly requestId: string } {
    const request = messages.find((message): message is { readonly type: 'changes/generateCommitMessage'; readonly requestId: string } => {
        return typeof message === 'object'
            && message !== null
            && 'type' in message
            && message.type === 'changes/generateCommitMessage'
            && 'requestId' in message
            && typeof message.requestId === 'string';
    });
    if (!request) { throw new Error('Expected generated commit message request.'); }
    return request;
}

function generatedSubmoduleCommitMessageRequest(messages: readonly unknown[]): {
    readonly type: 'changes/generateSubmoduleCommitMessage';
    readonly requestId: string;
    readonly submodulePath: string;
} {
    const request = messages.find((message): message is {
        readonly type: 'changes/generateSubmoduleCommitMessage';
        readonly requestId: string;
        readonly submodulePath: string;
    } => {
        return typeof message === 'object'
            && message !== null
            && 'type' in message
            && message.type === 'changes/generateSubmoduleCommitMessage'
            && 'requestId' in message
            && typeof message.requestId === 'string'
            && 'submodulePath' in message
            && typeof message.submodulePath === 'string';
    });
    if (!request) { throw new Error('Expected generated submodule commit message request.'); }
    return request;
}

function enabledGenerateButton(): HTMLElement {
    const button = screen.getAllByRole('button', { name: 'Generate commit message' }).find((candidate) => {
        return candidate instanceof HTMLButtonElement && !candidate.disabled;
    });
    if (!button) { throw new Error('Expected enabled generate commit message button.'); }
    return button;
}

function submoduleStatusRequests(messages: readonly unknown[]): readonly unknown[] {
    return messages.filter((message) => {
        if (!message || typeof message !== 'object') { return false; }
        return 'type' in message && message.type === 'changes/getSubmoduleStatus';
    });
}

function stashFilesRequests(messages: readonly unknown[]): readonly unknown[] {
    return messages.filter((message) => {
        if (!message || typeof message !== 'object') { return false; }
        return 'type' in message && message.type === 'changes/getStashFiles';
    });
}

async function nextTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
