// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComparisonRequest, ComparisonResponse } from '@protocol/comparison/messages';
import { ComparisonMode } from '@protocol/comparison/types';
import { comparisonSnapshot } from '@tests/helpers/comparison-state-fixture';
import { ComparisonWebview } from '@webview/comparison/comparison-webview';

const bridge = vi.hoisted(() => ({ postMessage: vi.fn<(message: ComparisonRequest) => void>() }));
vi.mock('@webview/platform/vscode-host', () => ({ vscodeApi: bridge }));

describe('comparison webview workflow', () => {
    beforeEach(() => { bridge.postMessage.mockClear(); localStorage.clear(); });
    afterEach(cleanup);

    function lastRequest<T extends ComparisonRequest['type']>(type: T): Extract<ComparisonRequest, { readonly type: T }> {
        const request = bridge.postMessage.mock.calls.map(([message]) => message).reverse().find((message): message is Extract<ComparisonRequest, { readonly type: T }> => message.type === type);
        if (!request) throw new Error(`No ${type} request`);
        return request;
    }
    function receive(message: ComparisonResponse) { act(() => window.dispatchEvent(new MessageEvent('message', { data: message }))); }
    function ready() {
        render(<ComparisonWebview />);
        const init = lastRequest('comparison/ready');
        receive({ type: 'comparison/init', requestId: init.requestId, repositoryLabel: 'Look Git', baseBranch: 'main', headBranch: 'feature/sessions', branches: { items: [{ name: 'main', ref: 'refs/heads/main', isRemote: false }, { name: 'feature/sessions', ref: 'refs/heads/feature/sessions', isRemote: false }], hasMore: false, totalCount: 2 } });
        const comparison = lastRequest('comparison/dataRequest');
        receive({ type: 'comparison/dataResponse', requestId: comparison.requestId, snapshot: comparisonSnapshot });
    }

    it('does not restart a cancelled initialization when its response was already queued', () => {
        render(<ComparisonWebview />);
        const request = lastRequest('comparison/ready');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        receive({ type: 'comparison/init', requestId: request.requestId, repositoryLabel: 'Look Git', baseBranch: 'main', headBranch: 'feature', branches: { items: [], hasMore: false, totalCount: 0 } });
        expect(bridge.postMessage.mock.calls.some(([message]) => message.type === 'comparison/dataRequest')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Load repository' }));
        expect(lastRequest('comparison/ready').requestId).not.toBe(request.requestId);
    });

    it('loads each clicked commit into the shared file tree and full-message panel and opens that commit’s file diff', async () => {
        ready();
        fireEvent.click(screen.getByRole('tab', { name: /Commits/ }));
        let request = lastRequest('comparison/detailsRequest');
        expect(request.hash).toBe('b'.repeat(40));
        receive({ type: 'comparison/detailsResponse', requestId: request.requestId, search: '', details: { hash: request.hash, fullMessage: 'Add sessions\n\nComplete session explanation.', files: { items: [{ status: 'A', filePath: 'src/session.ts' }], hasMore: false, totalCount: 1 } } });
        expect(screen.getByText('Complete session explanation.', { exact: false })).toBeInTheDocument();
        expect(within(screen.getByRole('region', { name: 'Commit details' })).getByTitle('src/session.ts')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Prepare session contracts/ }));
        request = lastRequest('comparison/detailsRequest');
        expect(request.hash).toBe('d'.repeat(40));
        expect(screen.queryByText('Complete session explanation.', { exact: false })).not.toBeInTheDocument();
        receive({ type: 'comparison/detailsResponse', requestId: request.requestId, search: '', details: { hash: request.hash, fullMessage: 'Prepare contracts\n\nContract details and reasoning.', files: { items: [{ status: 'M', filePath: 'src/contracts.ts', parentHash: 'e'.repeat(40) }, { status: 'M', filePath: 'modules/shared', isSubmodule: true }], hasMore: false, totalCount: 2 } } });
        expect(screen.getByText('Contract details and reasoning.', { exact: false })).toBeInTheDocument();
        fireEvent.click(screen.getByTitle('src/contracts.ts'));
        expect(lastRequest('comparison/openDiff')).toEqual(expect.objectContaining({ commitHash: 'd'.repeat(40), parentHash: 'e'.repeat(40), filePath: 'src/contracts.ts' }));
        const count = bridge.postMessage.mock.calls.length;
        fireEvent.click(within(screen.getByRole('region', { name: 'Commit details' })).getByTitle('modules/shared'));
        expect(bridge.postMessage.mock.calls).toHaveLength(count);
        const search = screen.getByRole('searchbox', { name: 'Search changed files' });
        fireEvent.change(search, { target: { value: 'contracts' } });
        expect(lastRequest('comparison/detailsRequest').search).toBe('contracts');
        await waitFor(() => expect(screen.getByRole('separator', { name: 'Resize commit message panel' })).toBeInTheDocument());
    });

    it('opens native diffs, tracks reviewed files and supports file navigation', () => {
        ready();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Viewed' }));
        expect(screen.getByText('1/3 viewed')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open diff' }));
        expect(lastRequest('comparison/openDiff')).toEqual(expect.objectContaining({ filePath: 'src/login.ts', snapshotId: 'snapshot' }));
        expect(lastRequest('comparison/openDiff').commitHash).toBeUndefined();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(lastRequest('comparison/openDiff').filePath).toBe('src/session.ts');
        fireEvent.click(within(screen.getByRole('tabpanel', { name: /Files/ })).getByTitle('src/login.ts'));
        expect(lastRequest('comparison/openDiff').filePath).toBe('src/login.ts');
    });

    it('resizes the results panel with the shared separator', () => {
        ready();
        const separator = screen.getByRole('separator', { name: 'Resize comparison results' });
        expect(separator).toHaveAttribute('aria-valuenow', '280');
        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        expect(separator).toHaveAttribute('aria-valuenow', '296');
        expect(localStorage.getItem('lookGit.comparisonSidebarWidth')).toBe('296');
    });

    it('requests the chosen comparison scope through the shared dropdown', () => {
        ready();
        fireEvent.click(screen.getByRole('combobox', { name: 'Comparison scope' }));
        fireEvent.click(screen.getByRole('option', { name: 'Difference between branch tips' }));
        expect(lastRequest('comparison/dataRequest')).toEqual(expect.objectContaining({
            baseBranch: 'main', headBranch: 'feature/sessions', mode: ComparisonMode.BranchTips,
        }));
    });

    it('searches and paginates branches through the shared searchable dropdown', () => {
        ready();
        fireEvent.click(screen.getByRole('combobox', { name: 'Base' }));
        let request = lastRequest('comparison/branchesRequest');
        expect(request.search).toBe('');
        receive({ type: 'comparison/branchesResponse', requestId: request.requestId, branches: {
            items: [{ name: 'main', ref: 'refs/heads/main', isRemote: false }], hasMore: false, totalCount: 1,
        } });
        expect(screen.getByRole('option', { name: 'main' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search base' }), { target: { value: 'upstream' } });
        request = lastRequest('comparison/branchesRequest');
        expect(request.search).toBe('upstream');
        expect(screen.queryByRole('option', { name: 'main' })).not.toBeInTheDocument();
        receive({ type: 'comparison/branchesResponse', requestId: request.requestId, branches: {
            items: [{ name: 'upstream/alpha', ref: 'refs/remotes/upstream/alpha', isRemote: true }], hasMore: true, cursor: 'page-2', totalCount: 2,
        } });
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        request = lastRequest('comparison/branchesRequest');
        expect(request.search).toBe('upstream');
        expect(request.cursor).toBe('page-2');
        receive({ type: 'comparison/branchesResponse', requestId: request.requestId, branches: {
            items: [{ name: 'upstream/beta', ref: 'refs/remotes/upstream/beta', isRemote: true }], hasMore: false, totalCount: 2,
        } });
        expect(screen.getAllByRole('option')).toHaveLength(2);
        fireEvent.click(screen.getByRole('option', { name: 'upstream/beta, remote' }));
        expect(lastRequest('comparison/dataRequest').baseBranch).toBe('refs/remotes/upstream/beta');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('searches comparison commits, keeps the query when loading more and handles empty results', () => {
        ready();
        fireEvent.click(screen.getByRole('tab', { name: /Commits/ }));
        const search = screen.getByRole('searchbox', { name: 'Search comparison commits' });
        fireEvent.change(search, { target: { value: 'contracts' } });
        let request = lastRequest('comparison/commitsRequest');
        expect(request).toEqual(expect.objectContaining({ snapshotId: 'snapshot', search: 'contracts', cursor: undefined }));
        expect(screen.queryByRole('button', { name: /Add sessions/ })).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Loading commits');
        receive({ type: 'comparison/commitsResponse', requestId: request.requestId, commits: {
            items: [comparisonSnapshot.commits.items[1]!], totalCount: 2, hasMore: true, cursor: 'next',
        } });
        const details = lastRequest('comparison/detailsRequest');
        expect(details.hash).toBe('d'.repeat(40));
        fireEvent.click(screen.getByRole('button', { name: 'Load more commits' }));
        request = lastRequest('comparison/commitsRequest');
        expect(request).toEqual(expect.objectContaining({ search: 'contracts', cursor: 'next' }));
        receive({ type: 'comparison/commitsResponse', requestId: request.requestId, commits: {
            items: [{ ...comparisonSnapshot.commits.items[0]!, message: 'More contracts' }], totalCount: 2, hasMore: false,
        } });
        expect(screen.getByRole('button', { name: /Prepare session contracts/ })).toHaveAttribute('aria-current', 'true');
        expect(screen.getByRole('button', { name: /More contracts/ })).toBeInTheDocument();
        fireEvent.change(search, { target: { value: 'missing' } });
        request = lastRequest('comparison/commitsRequest');
        receive({ type: 'comparison/commitsResponse', requestId: request.requestId, commits: { items: [], totalCount: 2, hasMore: false } });
        expect(screen.getByText('No commits match your search.')).toBeInTheDocument();
        fireEvent.change(search, { target: { value: '' } });
        expect(lastRequest('comparison/commitsRequest').search).toBe('');
        fireEvent.click(screen.getByRole('tab', { name: /Files/ }));
        expect(screen.getByRole('searchbox', { name: 'Search comparison files' })).toHaveValue('');
    });

    it('shows submodule revisions without file diff controls and supports branch swapping and cancellation', () => {
        ready();
        fireEvent.click(screen.getByTitle('modules/shared'));
        expect(screen.getByText('Submodule reference changed')).toBeInTheDocument();
        expect(screen.getByText('1'.repeat(40))).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open diff' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Swap base and branch to examine' }));
        expect(lastRequest('comparison/dataRequest')).toEqual(expect.objectContaining({ baseBranch: 'feature/sessions', headBranch: 'main' }));
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(lastRequest('comparison/cancel').channel).toBe('comparison');
        expect(screen.getByText('Comparison stopped')).toBeInTheDocument();
    });

    it('shows recoverable errors and refreshes stale comparisons', () => {
        ready();
        receive({ type: 'comparison/stale' });
        expect(screen.getByText('Branches changed. You are reviewing pinned revisions.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Open diff' }));
        const request = lastRequest('comparison/openDiff');
        receive({ type: 'comparison/error', requestId: request.requestId, channel: 'open', error: { code: 'gitOperationFailed', recoverable: true, message: 'Git unavailable' } });
        expect(screen.getByRole('alert')).toHaveTextContent('Git unavailable');
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(lastRequest('comparison/openDiff').requestId).not.toBe(request.requestId);
        fireEvent.click(screen.getByText('Refresh comparison', { selector: 'button' }));
        expect(lastRequest('comparison/dataRequest').baseBranch).toBe('main');
    });
});
