// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryCommit } from '../../../src/protocol/history/types';
import { createMockVsCodeApi, sendToWebview } from '../../helpers/webviewRuntime';

describe('HistoryWebview', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('announces readiness and renders pushed commits', async () => {
        const api = createMockVsCodeApi();
        const { HistoryWebview } = await import('../../../src/webview/history/HistoryWebview');

        render(<HistoryWebview />);
        sendToWebview({
            type: 'history/data',
            data: {
                commits: [commit('abc123456789', 'feat: render commit history')],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });

        await waitFor(() => expect(screen.getByText('feat: render commit history')).toBeInTheDocument());
        expect(api.messages).toContainEqual({ type: 'history/ready' });
    });

    it('requests the next page when loading more commits', async () => {
        const api = createMockVsCodeApi();
        const { HistoryWebview } = await import('../../../src/webview/history/HistoryWebview');

        render(<HistoryWebview />);
        sendToWebview({
            type: 'history/data',
            data: {
                commits: [commit('abc123456789', 'feat: render commit history')],
                page: { offset: 0, limit: 50 },
                hasMore: true,
            },
        });

        await waitFor(() => expect(screen.getByText('Load more commits')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Load more commits'));

        expect(api.messages).toContainEqual(expect.objectContaining({
            type: 'history/dataRequest',
            page: { offset: 1, limit: 50 },
        }));
    });

    it('requests commit details on click and expands files from the response', async () => {
        const api = createMockVsCodeApi();
        const { HistoryWebview } = await import('../../../src/webview/history/HistoryWebview');

        render(<HistoryWebview />);
        sendToWebview({
            type: 'history/data',
            data: {
                commits: [commit('abc123456789', 'feat: render commit history')],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });

        await waitFor(() => expect(screen.getByText('feat: render commit history')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('option', { name: /feat: render commit history/ }));

        const detailsRequest = api.messages.find((message) => isCommitDetailsRequest(message));
        expect(detailsRequest).toEqual(expect.objectContaining({
            type: 'history/commitDetailsRequest',
            hash: 'abc123456789',
        }));

        sendToWebview({
            type: 'history/commitDetailsResponse',
            requestId: isCommitDetailsRequest(detailsRequest) ? detailsRequest.requestId : 'history-details-1',
            details: {
                hash: 'abc123456789',
                fullMessage: 'feat: render commit history',
                files: [{ status: 'M', filePath: 'src/history.ts' }],
            },
        });

        await waitFor(() => expect(screen.getByRole('tree', { name: 'Changed files' })).toHaveTextContent('history.ts'));
        const fileRow = screen.getByTitle('Open diff for src/history.ts');
        fireEvent.click(fileRow);
        fireEvent.contextMenu(fileRow);

        expect(api.messages).toContainEqual(expect.objectContaining({
            type: 'history/openDiff',
            commitHash: 'abc123456789',
            filePath: 'src/history.ts',
            status: 'M',
        }));
        expect(api.messages).toContainEqual(expect.objectContaining({
            type: 'history/contextTarget',
            target: {
                kind: 'file',
                commitHash: 'abc123456789',
                file: { status: 'M', filePath: 'src/history.ts' },
            },
        }));
    });

    it('does not render a duplicate webview toolbar', async () => {
        const { HistoryWebview } = await import('../../../src/webview/history/HistoryWebview');

        render(<HistoryWebview />);
        sendToWebview({
            type: 'history/data',
            data: {
                commits: [],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });

        await waitFor(() => expect(screen.getByLabelText('Search commits')).toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: 'Commit History' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Select Branch')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More Actions')).not.toBeInTheDocument();
    });

    it('switches opened commit files from tree to list through a native view title message', async () => {
        const { HistoryWebview } = await import('../../../src/webview/history/HistoryWebview');

        render(<HistoryWebview />);
        sendToWebview({
            type: 'history/data',
            data: {
                commits: [commit('abc123456789', 'feat: render commit history')],
                page: { offset: 0, limit: 50 },
                hasMore: false,
            },
        });

        await waitFor(() => expect(screen.getByText('feat: render commit history')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('option', { name: /feat: render commit history/ }));

        sendToWebview({
            type: 'history/commitDetailsResponse',
            requestId: 'history-details-1',
            details: {
                hash: 'abc123456789',
                fullMessage: 'feat: render commit history',
                files: [
                    { status: 'M', filePath: 'src/history.ts' },
                    { status: 'A', filePath: 'tests/history.test.ts' },
                ],
            },
        });

        await waitFor(() => expect(screen.getByRole('tree', { name: 'Changed files' })).toBeInTheDocument());
        sendToWebview({ type: 'history/applyFileViewMode', mode: 'list' });

        await waitFor(() => expect(screen.getByRole('list', { name: 'Changed files' })).toBeInTheDocument());
        expect(screen.getByRole('list', { name: 'Changed files' })).toHaveTextContent('src/history.ts');
        expect(screen.getByRole('list', { name: 'Changed files' })).toHaveTextContent('tests/history.test.ts');
        expect(screen.queryByRole('tree', { name: 'Changed files' })).not.toBeInTheDocument();
    });
});

function commit(hash: string, message: string): HistoryCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName: 'Ada',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
        refs: [],
    };
}

function isCommitDetailsRequest(value: unknown): value is { readonly type: 'history/commitDetailsRequest'; readonly requestId: string; readonly hash: string } {
    return isRecord(value)
        && value.type === 'history/commitDetailsRequest'
        && typeof value.requestId === 'string'
        && typeof value.hash === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
