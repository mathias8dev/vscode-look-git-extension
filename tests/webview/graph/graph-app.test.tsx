// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphOperationCategory, GraphOperationStatus } from '@protocol/graph/messages';
import { OperationNoticeActionKind } from '@protocol/shared/operation';
import { SubmoduleStatus } from '@protocol/shared/repo';
import { createMockVsCodeApi, sendToWebview } from '@tests/helpers/webview-runtime';

const mainRepository = { repoId: 'main-repo-id', kind: 'main', path: '/repo' } as const;
const authKitRepository = { repoId: 'auth-kit-id', kind: 'submodule', path: '/repo/modules/auth-kit', parentRepoId: 'main-repo-id' } as const;

describe('GraphApp', () => {
    beforeEach(() => {
        vi.resetModules();
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
        localStorage.clear();
        vi.useRealTimers();
        globalThis.ResizeObserver = MockResizeObserver;
    });

    it('applies live Look Git font-size changes', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await act(async () => sendToWebview({ type: 'ui/fontSizeChanged', fontSize: 23 }));

        await waitFor(() => expect(document.documentElement.style.getPropertyValue('--look-git-font-size')).toBe('23px'));
        expect(document.documentElement.style.fontSize).toBe('23px');
        expect(document.body.style.fontSize).toBe('23px');
        expect(document.getElementById('root')?.style.fontSize).toBe('23px');
    });

    it('does not send a synthetic repository id before graph data is loaded', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);

        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        expect(latestGraphDataRequest(api.messages)).not.toHaveProperty('repoId');
    });

    it('exposes the branch panel splitter as a keyboard-resizable separator', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);

        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        expect(separator).toHaveAttribute('tabindex', '0');
        expect(separator).toHaveAttribute('aria-orientation', 'vertical');
        expect(separator).toHaveAttribute('aria-valuemin', '120');
        expect(separator).toHaveAttribute('aria-valuemax', '960');
        expect(separator).toHaveAttribute('aria-valuenow', '260');

        fireEvent.keyDown(separator, { key: 'ArrowRight' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '276'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('276');

        fireEvent.keyDown(separator, { key: 'Home' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '120'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('120');

        fireEvent.keyDown(separator, { key: 'End' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '960'));
        expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('960');
    });

    it('restores document styles and persists the branch panel width after pointer resize', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'text';
        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);

        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        fireEvent.pointerDown(separator, { pointerId: 1, clientX: 100 });
        expect(document.body.style.cursor).toBe('col-resize');
        expect(document.body.style.userSelect).toBe('none');

        fireEvent.pointerMove(separator, { pointerId: 1, clientX: 140 });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '300'));

        fireEvent.pointerUp(separator, { pointerId: 1, clientX: 140 });
        await waitFor(() => expect(localStorage.getItem('lookGit.branchPanelWidth')).toBe('300'));
        expect(document.body.style.cursor).toBe('default');
        expect(document.body.style.userSelect).toBe('text');
    });

    it('cleans document resize state when the graph unmounts during a drag', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        const { unmount } = render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        const separator = screen.getByRole('separator', { name: 'Resize branches panel' });
        fireEvent.pointerDown(separator, { pointerId: 2, clientX: 100 });

        expect(document.body.style.cursor).toBe('col-resize');
        expect(document.body.style.userSelect).toBe('none');

        unmount();

        expect(document.body.style.cursor).toBe('');
        expect(document.body.style.userSelect).toBe('');
    });

    it('exposes a resizable separator for the commit details panel', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await act(async () => sendToWebview({ type: 'graph/selectCommit', hash: 'abcdef1234567890' }));

        const separator = await screen.findByRole('separator', { name: 'Resize commit details panel' });
        expect(separator).toHaveAttribute('aria-valuemin', '180');
        expect(separator).toHaveAttribute('aria-valuemax', '720');
        expect(separator).toHaveAttribute('aria-valuenow', '320');

        fireEvent.keyDown(separator, { key: 'ArrowLeft' });
        await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '336'));
        expect(localStorage.getItem('lookGit.commitDetailsPanelWidth')).toBe('336');
    });

    it('requests unfiltered graph data in a submodule scope when a submodule row is clicked', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);

        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: {
                repository: mainRepository,
                branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: 'main-head' }],
                tags: [],
                commits: [],
                currentBranch: 'main',
                currentUser: 'Test User',
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
                hasRemotes: false,
                worktrees: [],
                worktreeWips: [],
                submodules: [{
                    repository: authKitRepository,
                    path: 'modules/auth-kit',
                    name: 'auth-kit',
                    status: SubmoduleStatus.Clean,
                    branches: [{ name: 'feature/oauth', isRemote: false, isCurrent: true, hash: 'submodule-head' }],
                    worktrees: [],
                }],
            },
        }));

        fireEvent.click(await screen.findByTitle('modules/auth-kit'));

        await waitFor(() => expect(graphDataRequests(api.messages).some((request) => request.repository?.repoId === authKitRepository.repoId)).toBe(true));
        const scopedRequest = latestGraphDataRequest(api.messages);
        expect(scopedRequest.repository).toEqual(authKitRepository);
        expect(scopedRequest.filters?.branches).toBeUndefined();
    });

    it('keeps scoped submodule branches visible when a main repository data push arrives', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);

        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: mainGraphDataWithAuthKitSubmodule(),
        }));
        fireEvent.click(await screen.findByTitle('modules/auth-kit'));

        await waitFor(() => expect(graphDataRequests(api.messages).some((request) => request.repository?.repoId === authKitRepository.repoId)).toBe(true));
        const scopedRequest = latestGraphDataRequest(api.messages);

        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: scopedRequest.requestId,
            data: {
                repository: authKitRepository,
                branches: [{ name: 'feature/oauth', isRemote: false, isCurrent: true, hash: 'submodule-head' }],
                tags: [],
                commits: [],
                currentBranch: 'feature/oauth',
                currentUser: 'Test User',
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
                hasRemotes: false,
                worktrees: [],
                worktreeWips: [],
                submodules: [],
            },
        }));

        expect(await findBranchLeaf('oauth')).toBeInTheDocument();
        const requestsBeforePush = graphDataRequests(api.messages).length;
        await act(async () => sendToWebview({
            type: 'graph/dataPush',
            repoId: '/repo',
            data: {
                repository: mainRepository,
                branches: [],
                tags: [],
                commits: [],
                currentBranch: 'main',
                currentUser: 'Test User',
                hasMore: false,
                loadedCount: 0,
                totalCount: 0,
                hasRemotes: false,
                worktrees: [],
                worktreeWips: [],
                submodules: [],
            },
        }));

        expect(findBranchLeafSync('oauth')).toBeInTheDocument();
        await waitFor(() => expect(graphDataRequests(api.messages).length).toBeGreaterThan(requestsBeforePush));
        expect(latestGraphDataRequest(api.messages).repository).toEqual(authKitRepository);
    });

    it('shows operation feedback and busy state for graph repository commands', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        const fetchButton = screen.getByRole('button', { name: 'Fetch' });

        await act(async () => sendToWebview({
            type: 'graph/operationStatus',
            operationId: 'fetch-1',
            status: GraphOperationStatus.Running,
            category: GraphOperationCategory.Repository,
            command: 'fetch',
        }));

        expect(screen.getByRole('status')).toHaveTextContent('Fetch all remotes...');
        expect(fetchButton).toHaveAttribute('aria-busy', 'true');
        expect(fetchButton).toBeDisabled();

        await act(async () => sendToWebview({
            type: 'graph/operationStatus',
            operationId: 'fetch-1',
            status: GraphOperationStatus.Success,
            category: GraphOperationCategory.Repository,
            command: 'fetch',
        }));

        expect(screen.getByRole('status')).toHaveTextContent('Fetched all remotes.');
        expect(fetchButton).not.toHaveAttribute('aria-busy');
        expect(fetchButton).not.toBeDisabled();
    });

    it('shows output and dismiss actions for failed graph operations', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await act(async () => sendToWebview({
            type: 'graph/operationStatus',
            operationId: 'push-1',
            status: GraphOperationStatus.Failed,
            category: GraphOperationCategory.Branch,
            command: 'push',
            target: 'experimental',
            actions: [OperationNoticeActionKind.ShowOutput],
        }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Could not push experimental.');
        fireEvent.click(screen.getByRole('button', { name: 'Show Output' }));

        expect(api.messages).toContainEqual({ type: 'graph/showOutput' });

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        await waitFor(() => expect(screen.queryByText('Could not push experimental.')).not.toBeInTheDocument());
    });

    it('shows an actionable empty state for an initialized repository without commits', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);

        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: graphData([]),
        }));

        expect(await screen.findByText('No commits yet')).toBeInTheDocument();
        expect(screen.getByText('Create the initial commit from the Changes panel.')).toBeInTheDocument();
    });

    it('clears graph filters from the filtered empty state', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);
        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: graphData([]),
        }));

        fireEvent.change(screen.getByLabelText('Search commits'), { target: { value: 'oauth' } });
        await waitFor(() => expect(latestGraphDataRequest(api.messages).filters?.search).toBe('oauth'));
        const filteredRequest = latestGraphDataRequest(api.messages);
        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: filteredRequest.requestId,
            data: graphData([]),
        }));

        expect(await screen.findByText('No matching commits')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

        await waitFor(() => expect(latestGraphDataRequest(api.messages).filters).toEqual({}));
    });

    it('moves graph row focus with arrow keys', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);
        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: graphData([
                graphCommit('bbbbbbb2222222', 'feat(graph): second commit', ['aaaaaaa1111111']),
                graphCommit('aaaaaaa1111111', 'feat(graph): first commit'),
            ]),
        }));

        const secondCommit = await screen.findByTitle(/feat\(graph\): second commit/);
        const firstCommit = screen.getByTitle(/feat\(graph\): first commit/);
        secondCommit.focus();

        fireEvent.keyDown(secondCommit, { key: 'ArrowDown' });
        expect(firstCommit).toHaveFocus();

        fireEvent.keyDown(firstCommit, { key: 'ArrowUp' });
        expect(secondCommit).toHaveFocus();

        fireEvent.keyDown(secondCommit, { key: 'ArrowDown', shiftKey: true });
        await waitFor(() => expect(firstCommit).toHaveAttribute('aria-selected', 'true'));
    });

    it('requests the next page when loading more graph rows', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);
        await act(async () => sendToWebview({
            type: 'graph/dataResponse',
            requestId: initialRequest.requestId,
            data: {
                ...graphData([
                    graphCommit('bbbbbbb2222222', 'feat(graph): second commit', ['aaaaaaa1111111']),
                    graphCommit('aaaaaaa1111111', 'feat(graph): first commit'),
                ]),
                hasMore: true,
                loadedCount: 2,
                totalCount: 3,
            },
        }));

        await waitFor(() => expect(api.messages.some(isGraphLoadMoreRequest)).toBe(true));
        const loadMoreRequest = latestGraphLoadMoreRequest(api.messages);

        expect(loadMoreRequest.requestId).toBe('graph:more:0:2');
        expect(loadMoreRequest.page).toEqual({ offset: 2, limit: 300 });
    });

    it('offers retry and output actions for graph errors with details', async () => {
        const api = createMockVsCodeApi();
        const { GraphApp } = await import('@webview/graph/graph-app');

        render(<GraphApp sendMessage={(message) => api.postMessage(message)} />);
        await waitFor(() => expect(api.messages.some(isGraphDataRequest)).toBe(true));
        const initialRequest = latestGraphDataRequest(api.messages);

        await act(async () => sendToWebview({
            type: 'graph/error',
            requestId: initialRequest.requestId,
            message: 'Fetch failed: origin',
            error: {
                code: 'gitOperationFailed',
                message: 'Fetch failed: origin',
                operation: 'graph/repositoryCommand',
                recoverable: true,
                details: 'fatal: Authentication failed',
            },
        }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Fetch failed: origin');
        fireEvent.click(screen.getByRole('button', { name: 'Show Output' }));
        expect(api.messages).toContainEqual({ type: 'graph/showOutput' });

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(graphDataRequests(api.messages).length).toBeGreaterThan(1));
    });
});

class MockResizeObserver implements ResizeObserver {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
}

function latestGraphDataRequest(messages: readonly unknown[]): GraphDataRequestLike {
    const request = messages.filter(isGraphDataRequest).at(-1);
    if (!request) { throw new Error('Expected a graph data request.'); }
    return request;
}

function isGraphDataRequest(value: unknown): value is GraphDataRequestLike {
    return typeof value === 'object'
        && value !== null
        && 'type' in value
        && value.type === 'graph/dataRequest'
        && 'requestId' in value
        && typeof value.requestId === 'string';
}

interface GraphDataRequestLike {
    readonly type: 'graph/dataRequest';
    readonly requestId: string;
    readonly filters?: {
        readonly branches?: readonly string[];
        readonly search?: string;
    };
    readonly repository?: typeof mainRepository | typeof authKitRepository;
}

function graphDataRequests(messages: readonly unknown[]): readonly GraphDataRequestLike[] {
    return messages.filter(isGraphDataRequest);
}

function latestGraphLoadMoreRequest(messages: readonly unknown[]): GraphLoadMoreRequestLike {
    const request = messages.filter(isGraphLoadMoreRequest).at(-1);
    if (!request) { throw new Error('Expected a graph load-more request.'); }
    return request;
}

function isGraphLoadMoreRequest(value: unknown): value is GraphLoadMoreRequestLike {
    return typeof value === 'object'
        && value !== null
        && 'type' in value
        && value.type === 'graph/loadMore'
        && 'requestId' in value
        && typeof value.requestId === 'string';
}

interface GraphLoadMoreRequestLike {
    readonly type: 'graph/loadMore';
    readonly requestId: string;
    readonly page: {
        readonly offset: number;
        readonly limit: number;
    };
}

async function findBranchLeaf(label: string): Promise<HTMLElement> {
    const element = await screen.findByText(label);
    const leaf = element.closest('.branch-leaf');
    if (!(leaf instanceof HTMLElement)) { throw new Error(`Expected branch leaf for ${label}.`); }
    return leaf;
}

function findBranchLeafSync(label: string): HTMLElement {
    const element = screen.getByText(label);
    const leaf = element.closest('.branch-leaf');
    if (!(leaf instanceof HTMLElement)) { throw new Error(`Expected branch leaf for ${label}.`); }
    return leaf;
}

function mainGraphDataWithAuthKitSubmodule() {
    return {
        repository: mainRepository,
        branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: 'main-head' }],
        tags: [],
        commits: [],
        currentBranch: 'main',
        currentUser: 'Test User',
        hasMore: false,
        loadedCount: 0,
        totalCount: 0,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
        submodules: [{
            repository: authKitRepository,
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.Clean,
            branches: [{ name: 'feature/oauth', isRemote: false, isCurrent: true, hash: 'submodule-head' }],
            worktrees: [],
        }],
    };
}

function graphData(commits: readonly ReturnType<typeof graphCommit>[]) {
    return {
        repository: mainRepository,
        branches: [{ name: 'main', isRemote: false, isCurrent: true, hash: commits[0]?.hash ?? '' }],
        tags: [],
        commits,
        currentBranch: 'main',
        currentUser: 'Test User',
        hasMore: false,
        loadedCount: commits.length,
        totalCount: commits.length,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
        submodules: [],
    };
}

function graphCommit(hash: string, message: string, parents: readonly string[] = []) {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: parents,
        refs: [],
    };
}
