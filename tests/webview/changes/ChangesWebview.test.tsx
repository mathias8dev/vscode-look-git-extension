// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictState, RepositoryState } from '../../../src/protocol/changes/types';
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
