// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GraphData } from '@protocol/graph/types';
import type { TagPublication, TagStatusRequest } from '@protocol/graph/messages';
import { GraphTag } from '@webview/features/graph/graph-tag';
import { graphRequestId } from '@webview/features/graph/graph-state';
import { GraphApp } from '@webview/graph/graph-app';
import { tagPublicationModel } from '@webview/features/graph/tag-publication-model';
import { detachedHeadModel } from '@webview/features/graph/detached-head-model';
import { createMockVsCodeApi, sendToWebview } from '@tests/helpers/webview-runtime';

const repository = { repoId: 'repo', kind: 'main', path: '/repo' } as const;
const data: GraphData = {
    repository, branches: [{ name: 'main', hash: 'new-head', isRemote: false, isCurrent: true }],
    tags: [{ name: 'v1', hash: 'base' }],
    commits: [{ hash: 'base', shortHash: 'base', message: 'Release', authorName: 'Mathias', authorEmail: 'a@example.com', authorDate: '2026-11-14T00:00:00Z', refs: ['tag: v1'], parentHashes: [] }],
    currentBranch: 'main', currentUser: 'Mathias', hasMore: false, loadedCount: 1, totalCount: 1, hasRemotes: true,
    worktrees: [{ path: '/repo', head: 'new-head', branch: 'main', isDetached: false, isMain: true, isLocked: false }],
    worktreeWips: [], submodules: [],
};

describe('graph tag interactions', () => {
    it('checks large tag lists in bounded batches and rejects stale status responses', async () => {
        globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        const api = createMockVsCodeApi();
        render(<GraphApp sendMessage={message => api.postMessage(message)} />);
        const tags = Array.from({ length: 51 }, (_, index) => ({ name: `v${index}`, hash: 'base' }));
        await act(async () => sendToWebview({ type: 'graph/dataResponse', requestId: graphRequestId(0, 'replace'), data: { ...data, tags } }));
        await waitFor(() => expect(api.messages.filter(isTagStatusRequest)).toHaveLength(1));
        const first = api.messages.filter(isTagStatusRequest)[0]!;
        expect(first.tags).toHaveLength(50);
        await act(async () => sendToWebview({ type: 'graph/tagStatusResponse', requestId: first.requestId, repository,
            checkedAt: '2026-11-14T12:00:00Z', tags: first.tags.map(name => ({ name, remotes: [] })) }));
        await waitFor(() => expect(api.messages.filter(isTagStatusRequest)).toHaveLength(2));
        expect(api.messages.filter(isTagStatusRequest)[1]?.tags).toEqual(['v50']);
        await act(async () => sendToWebview({ type: 'graph/tagStatusResponse', requestId: first.requestId, repository,
            checkedAt: '2026-11-14T12:00:00Z', tags: [{ name: 'v50', remotes: [{ name: 'upstream', status: 'same' }] }] }));
        expect(screen.queryAllByLabelText('Pushed')).toHaveLength(0);
    });

    it.each(['badge', 'list'] as const)('lets the native host receive mouse and keyboard menus from a tag %s', variant => {
        const nativeMenu = vi.fn<(event: MouseEvent) => void>();
        const onSelect = vi.fn();
        const onContextTarget = vi.fn();
        window.addEventListener('contextmenu', nativeMenu);
        try {
            render(<GraphTag tag={{ name: 'v1', hash: 'base' }} isCurrent={false} variant={variant}
                onSelect={onSelect} onContextTarget={onContextTarget} />);
            const button = screen.getByRole('button', { name: /v1/ });
            fireEvent.click(button);
            expect(onSelect).toHaveBeenCalledWith('base');
            expect(onContextTarget).not.toHaveBeenCalled();
            fireEvent.contextMenu(button);
            expect(nativeMenu).toHaveBeenCalledTimes(1);
            expect(nativeMenu.mock.calls[0]?.[0].defaultPrevented).toBe(false);
            expect(onContextTarget).toHaveBeenLastCalledWith({ kind: 'tag', tag: 'v1', isCurrent: false });
            expect(button.getAttribute('data-vscode-context')).toContain('"webviewSection":"graphTag"');
            fireEvent.keyDown(button, { key: 'F10', shiftKey: true });
            expect(nativeMenu).toHaveBeenCalledTimes(2);
            expect(nativeMenu.mock.calls[1]?.[0].defaultPrevented).toBe(false);
        } finally { window.removeEventListener('contextmenu', nativeMenu); }
    });

    it('checks tags in the background, preserves the check across graph refreshes, and returns to the previous branch', async () => {
        globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        const api = createMockVsCodeApi();
        render(<GraphApp sendMessage={message => api.postMessage(message)} />);
        await act(async () => sendToWebview({ type: 'graph/dataResponse', requestId: graphRequestId(0, 'replace'), data }));
        await waitFor(() => expect(api.messages.some(isTagStatusRequest)).toBe(true));
        const request = api.messages.find(isTagStatusRequest);
        if (!request) { throw new Error('Expected a tag status request'); }
        expect(request).toMatchObject({ tags: ['v1'], repository });
        await act(async () => sendToWebview({ type: 'graph/tagStatusResponse', requestId: request.requestId, repository,
            checkedAt: '2026-11-14T12:00:00Z', tags: [{ name: 'v1', remotes: [{ name: 'upstream', status: 'same' }] }] }));
        expect(screen.getAllByLabelText('Pushed')).toHaveLength(2);
        await act(async () => sendToWebview({ type: 'graph/dataPush', repoId: 'repo', data }));
        expect(api.messages.filter(isTagStatusRequest)).toHaveLength(1);
        await act(async () => sendToWebview({ type: 'graph/dataPush', repoId: 'repo', data: {
            ...data, currentBranch: 'HEAD', branches: data.branches.map(branch => ({ ...branch, isCurrent: false })),
            worktrees: [{ ...data.worktrees[0]!, head: 'base', branch: undefined, isDetached: true }],
        } }));
        expect(screen.getByText('Viewing v1 · Detached HEAD')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Create Branch…' }));
        expect(api.messages).toContainEqual({ type: 'graph/tagCommand', command: 'newBranch', tag: 'v1', repository });
        fireEvent.click(screen.getByRole('button', { name: 'Return to main' }));
        expect(api.messages).toContainEqual({ type: 'graph/branchCommand', command: 'checkout', branch: 'main', isRemote: false, repository });
        fireEvent.click(screen.getByRole('button', { name: 'Refresh remote tag status' }));
        await waitFor(() => expect(api.messages.filter(isTagStatusRequest)).toHaveLength(2));
    });

    it('refreshes publication badges after remote deletion and removes locally deleted tags', async () => {
        globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
        const api = createMockVsCodeApi();
        render(<GraphApp sendMessage={message => api.postMessage(message)} />);
        await act(async () => sendToWebview({ type: 'graph/dataResponse', requestId: graphRequestId(0, 'replace'), data }));
        await waitFor(() => expect(api.messages.some(isTagStatusRequest)).toBe(true));
        const first = api.messages.find(isTagStatusRequest);
        if (!first) { throw new Error('Expected a tag status request'); }
        await act(async () => sendToWebview({ type: 'graph/tagStatusResponse', requestId: first.requestId, repository,
            checkedAt: '2026-11-26T12:00:00Z', tags: [{ name: 'v1', remotes: [{ name: 'upstream', status: 'same' }] }] }));
        expect(screen.getAllByLabelText('Pushed')).toHaveLength(2);

        await act(async () => sendToWebview({ type: 'graph/tagStatusInvalidated', repository }));
        await waitFor(() => expect(api.messages.filter(isTagStatusRequest)).toHaveLength(2));
        const second = api.messages.filter(isTagStatusRequest)[1];
        if (!second) { throw new Error('Expected a refreshed tag status request'); }
        await act(async () => sendToWebview({ type: 'graph/tagStatusResponse', requestId: second.requestId, repository,
            checkedAt: '2026-11-26T12:01:00Z', tags: [{ name: 'v1', remotes: [{ name: 'upstream', status: 'missing' }] }] }));
        expect(screen.getAllByLabelText('Local only')).toHaveLength(2);
        expect(screen.queryAllByLabelText('Pushed')).toHaveLength(0);

        await act(async () => sendToWebview({ type: 'graph/dataPush', repoId: 'repo', data: {
            ...data, tags: [], commits: data.commits.map(commit => ({ ...commit, refs: [] })),
        } }));
        expect(screen.queryAllByRole('button', { name: /v1/ })).toHaveLength(0);
    });
});

describe('tag publication presentation', () => {
    it.each([
        [undefined, 'Unknown'],
        [{ name: 'v1', remotes: [] }, 'Local only'],
        [{ name: 'v1', remotes: [{ name: 'upstream', status: 'missing' }] }, 'Local only'],
        [{ name: 'v1', remotes: [{ name: 'upstream', status: 'unavailable' }] }, 'Unknown'],
        [{ name: 'v1', remotes: [{ name: 'upstream', status: 'same' }, { name: 'backup', status: 'unavailable' }] }, 'Pushed'],
        [{ name: 'v1', remotes: [{ name: 'upstream', status: 'same' }, { name: 'backup', status: 'different' }] }, 'Different on remote'],
    ] satisfies readonly (readonly [TagPublication | undefined, string])[])('presents %j as %s', (publication, expected) => {
        expect(tagPublicationModel(publication).label).toBe(expected);
    });

    it('finds a detached tag even when graph filters hide HEAD, without confusing other worktrees', () => {
        const input = { currentBranch: 'HEAD', repositoryPath: '/repo', tags: data.tags, commits: [], worktrees: [
            { ...data.worktrees[0]!, path: '/another', head: 'wrong', isDetached: true },
            { ...data.worktrees[0]!, head: 'base', isDetached: true },
        ] };
        expect(detachedHeadModel(input)).toEqual({ hash: 'base', label: 'v1', tags: ['v1'] });
        expect(detachedHeadModel({ ...input, currentBranch: 'main' })).toBeUndefined();
        expect(detachedHeadModel({ ...input, worktrees: [], commits: [] })).toBeUndefined();
    });
});

function isTagStatusRequest(message: unknown): message is TagStatusRequest {
    return typeof message === 'object' && message !== null && 'type' in message && message.type === 'graph/tagStatusRequest';
}
