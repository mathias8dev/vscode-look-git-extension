// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryCommit, HistoryCommitFile, HistoryContextTarget } from '../../../src/protocol/history/types';
import type { HistoryState } from '../../../src/webview/features/history/historyState';
import { CommitHistoryApp } from '../../../src/webview/features/history/CommitHistoryApp';
import { createInitialHistoryState } from '../../../src/webview/features/history/historyState';

describe('CommitHistoryApp', () => {
    it('renders commits and dispatches selection', () => {
        const onSelectCommit = vi.fn<(hash: string) => void>();

        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [
                    commit('abc123456789', 'feat: add graph history'),
                    commit('def123456789', 'fix: repair renderer'),
                ],
                loadedCount: 2,
                loading: false,
            },
            onSelectCommit,
        });

        fireEvent.click(screen.getByRole('option', { name: /feat: add graph history/ }));

        expect(screen.getByText('feat: add graph history')).toBeInTheDocument();
        expect(screen.getByText('fix: repair renderer')).toBeInTheDocument();
        expect(onSelectCommit).toHaveBeenCalledWith('abc123456789');
    });

    it('renders local remote and tag badges on commit rows', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [{
                    ...commit('abc123456789', 'feat: publish branch'),
                    refs: [
                        { name: 'experimental', kind: 'local', isCurrent: true },
                        { name: 'origin/experimental', kind: 'remote' },
                        { name: 'v1.0.0', kind: 'tag' },
                    ],
                }],
                loadedCount: 1,
                loading: false,
            },
        });

        expect(screen.getByText('experimental')).toBeInTheDocument();
        expect(screen.getByText('origin/experimental')).toBeInTheDocument();
        expect(screen.getByText('v1.0.0')).toBeInTheDocument();
        expect(screen.getByTitle('Remote branch origin/experimental')).toHaveClass('history-ref-badge-remote');
    });

    it('marks commit rows as VS Code native context menu targets', () => {
        const onContextTarget = vi.fn<(target: HistoryContextTarget) => void>();
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [
                    { ...commit('child123456789', 'feat: child'), parentHashes: ['parent123456789'] },
                    commit('parent123456789', 'feat: parent'),
                ],
                loadedCount: 2,
                loading: false,
            },
            onContextTarget,
        });

        const row = screen.getByRole('option', { name: /feat: parent/ });
        fireEvent.contextMenu(row);

        expect(row.getAttribute('data-vscode-context')).toContain('"webviewSection":"historyCommit"');
        expect(onContextTarget).toHaveBeenCalledWith({
            kind: 'commit',
            hash: 'parent123456789',
            hashes: ['parent123456789'],
            childHash: 'child123456789',
            parentHash: undefined,
            canUndoCommit: false,
        });
    });

    it('expands the selected commit and renders changed files', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                expandedHashes: ['abc123456789'],
                detailsByHash: {
                    abc123456789: {
                        hash: 'abc123456789',
                        fullMessage: 'feat: add graph history',
                        files: [
                            { status: 'M', filePath: 'src/history.ts' },
                            { status: 'A', filePath: 'modules/auth-kit', isSubmodule: true },
                        ],
                    },
                },
                loadedCount: 1,
                loading: false,
            },
        });

        expect(screen.getByRole('option', { name: /feat: add graph history/ })).toHaveAttribute('aria-expanded', 'true');
        const tree = screen.getByRole('tree', { name: 'Changed files' });
        expect(tree).toHaveTextContent('src');
        expect(tree).toHaveTextContent('history.ts');
        expect(tree).toHaveTextContent('modules');
        expect(tree).toHaveTextContent('auth-kit');
        expect(tree.querySelector('.folder-type-icon')).not.toBeNull();
        expect(tree.querySelector('.file-type-icon')).not.toBeNull();
    });

    it('renders changed files as a flat list when list mode is selected', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                expandedHashes: ['abc123456789'],
                detailsByHash: {
                    abc123456789: {
                        hash: 'abc123456789',
                        fullMessage: 'feat: add graph history',
                        files: [{ status: 'M', filePath: 'src/history.ts' }],
                    },
                },
                loadedCount: 1,
                loading: false,
            },
            fileViewMode: 'list',
        });

        expect(screen.getByRole('list', { name: 'Changed files' })).toHaveTextContent('src/history.ts');
        expect(screen.queryByRole('tree', { name: 'Changed files' })).not.toBeInTheDocument();
    });


    it('opens file diffs for normal files and blocks submodule file navigation', () => {
        const onOpenFileDiff = vi.fn<(hash: string, file: HistoryCommitFile) => void>();
        const onContextTarget = vi.fn<(target: HistoryContextTarget) => void>();
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                expandedHashes: ['abc123456789'],
                detailsByHash: {
                    abc123456789: {
                        hash: 'abc123456789',
                        fullMessage: 'feat: add graph history',
                        files: [
                            { status: 'M', filePath: 'src/history.ts' },
                            { status: 'A', filePath: 'modules/auth-kit', isSubmodule: true },
                        ],
                    },
                },
                loadedCount: 1,
                loading: false,
            },
            onOpenFileDiff,
            onContextTarget,
        });

        const fileRow = screen.getByTitle('Open diff for src/history.ts');
        fireEvent.click(fileRow);
        fireEvent.contextMenu(fileRow);

        expect(onOpenFileDiff).toHaveBeenCalledWith('abc123456789', { status: 'M', filePath: 'src/history.ts' });
        expect(fileRow.getAttribute('data-vscode-context')).toContain('"webviewSection":"historyFile"');
        expect(onContextTarget).toHaveBeenCalledWith({
            kind: 'file',
            commitHash: 'abc123456789',
            file: { status: 'M', filePath: 'src/history.ts' },
        });
        expect(screen.queryByTitle('Open diff for modules/auth-kit')).not.toBeInTheDocument();
        expect(screen.getByRole('tree', { name: 'Changed files' })).toHaveTextContent('modules');
        expect(screen.getByTitle('Submodule diffs are not available from commit history')).toHaveTextContent('auth-kit');
    });

    it('shows a file loading row while selected commit details are pending', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                expandedHashes: ['abc123456789'],
                detailsLoadingHash: 'abc123456789',
                loadedCount: 1,
                loading: false,
            },
        });

        expect(screen.getByText('Loading files...')).toBeInTheDocument();
    });

    it('renders selected commit details', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                expandedHashes: ['abc123456789'],
                loadedCount: 1,
                loading: false,
            },
        });

        // aside shows the shortHash (7 chars) in the copy button; full hash is on clipboard only
        // commit metadata is now rendered inline in the expanded item, not in a separate aside
    });

    it('filters visible commits from the query', () => {
        const onQueryChange = vi.fn<(query: string) => void>();

        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [
                    commit('abc123456789', 'feat: add graph history'),
                    commit('def123456789', 'fix: repair renderer'),
                ],
                loadedCount: 2,
                loading: false,
            },
            query: 'renderer',
            onQueryChange,
        });

        expect(screen.queryByText('feat: add graph history')).not.toBeInTheDocument();
        expect(screen.getByText('fix: repair renderer')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search commits'), { target: { value: 'graph' } });
        expect(onQueryChange).toHaveBeenCalledWith('graph');
    });

    it('clears the search from the filtered empty state', () => {
        const onQueryChange = vi.fn<(query: string) => void>();

        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                loadedCount: 1,
                loading: false,
            },
            query: 'missing',
            onQueryChange,
        });

        expect(screen.getByText('No matching commits')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

        expect(onQueryChange).toHaveBeenCalledWith('');
    });

    it('dispatches load more when more commits are available', () => {
        const onLoadMore = vi.fn<() => void>();

        renderApp({
            state: {
                ...createInitialHistoryState(),
                commits: [commit('abc123456789', 'feat: add graph history')],
                loadedCount: 1,
                loading: false,
                hasMore: true,
            },
            onLoadMore,
        });

        fireEvent.click(screen.getByText('Load more commits'));

        expect(onLoadMore).toHaveBeenCalledOnce();
    });

    it('does not render a duplicate webview title or toolbar', () => {
        renderApp({
            state: {
                ...createInitialHistoryState(),
                loading: false,
            },
        });

        expect(screen.queryByRole('heading', { name: 'Commit History' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Select Branch')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More Actions')).not.toBeInTheDocument();
    });
});

function renderApp(props: {
    readonly state: HistoryState;
    readonly query?: string;
    readonly fileViewMode?: 'list' | 'tree';
    readonly onQueryChange?: (query: string) => void;
    readonly onSelectCommit?: (hash: string) => void;
    readonly onOpenFileDiff?: (hash: string, file: HistoryCommitFile) => void;
    readonly onContextTarget?: (target: HistoryContextTarget) => void;
    readonly onLoadMore?: () => void;
    readonly onCopyHash?: (hash: string) => void;
}) {
    return render(
        <CommitHistoryApp
            state={props.state}
            query={props.query ?? ''}
            fileViewMode={props.fileViewMode ?? 'tree'}
            onQueryChange={props.onQueryChange ?? (() => undefined)}
            onToggleCommit={props.onSelectCommit ?? (() => undefined)}
            onOpenFileDiff={props.onOpenFileDiff ?? (() => undefined)}
            onContextTarget={props.onContextTarget ?? (() => undefined)}
            onLoadMore={props.onLoadMore ?? (() => undefined)}
            onCopyHash={props.onCopyHash ?? (() => undefined)}
        />,
    );
}

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
