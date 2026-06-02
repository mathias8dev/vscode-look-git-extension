// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictState, RepositoryState } from '../../../src/protocol/changes/types';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { createMockVsCodeApi, sendToWebview } from '../../helpers/webviewRuntime';

describe('ChangesWebview', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('announces readiness without rendering a duplicate toolbar', async () => {
        const api = createMockVsCodeApi();
        const { ChangesWebview } = await import('../../../src/webview/changes/ChangesWebview');

        render(<ChangesWebview />);
        sendStatusData();

        await waitFor(() => expect(screen.getByLabelText('Repository changes')).toBeInTheDocument());

        expect(api.messages).toContainEqual({ type: 'changes/ready' });
        expect(screen.queryByRole('heading', { level: 1, name: 'Changes' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Refresh Changes')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Open Git Graph')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More Actions')).not.toBeInTheDocument();
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
                stashes: [],
            },
        });

        await waitFor(() => expect(screen.getByTitle('src/inner.ts')).toBeInTheDocument());
        sendStatusDataWithSubmodule();

        await waitFor(() => expect(screen.getByRole('button', { name: 'Hide changes' })).toBeInTheDocument());
        await waitFor(() => expect(submoduleStatusRequests(api.messages).length).toBe(2));
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
});

function sendStatusData(): void {
    sendToWebview({
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
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
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [{ path: 'modules/lib', name: 'lib', status: SubmoduleStatus.Dirty }],
        },
    });
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
