import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommitHistoryProvider } from '../src/commitHistoryProvider';
import { CommitItem, LoadMoreItem } from '../src/commitItem';
import type { GitCommitInfo } from '../src/gitService';
import { resetVscodeMock } from './helpers/providerRuntime';

describe('CommitHistoryProvider pagination', () => {
    beforeEach(resetVscodeMock);

    function commit(index: number): GitCommitInfo {
        const hash = index.toString(16).padStart(40, '0');
        return {
            hash,
            shortHash: hash.substring(0, 7),
            message: `commit ${index}`,
            authorName: 'Author',
            authorEmail: 'author@example.com',
            authorDate: new Date('2024-01-01T00:00:00Z'),
            parentHashes: [],
        };
    }

    it('loads the next page when VS Code resolves the load-more tree item', async () => {
        const commits = Array.from({ length: 75 }, (_, index) => commit(index));
        const service = {
            getLog: vi.fn(async (limit: number, skip: number) => commits.slice(skip, skip + limit)),
            getCommitFiles: vi.fn(async () => []),
            getWorkingDirectory: vi.fn(() => '/workspace'),
        };
        const provider = new CommitHistoryProvider(service as any);

        const initialItems = await provider.getChildren();
        const loadMoreItem = initialItems.at(-1);

        expect(service.getLog).toHaveBeenCalledWith(50, 0);
        expect(initialItems).toHaveLength(51);
        expect(loadMoreItem).toBeInstanceOf(LoadMoreItem);

        provider.resolveTreeItem(loadMoreItem as any, loadMoreItem as any, {} as any);
        provider.resolveTreeItem(loadMoreItem as any, loadMoreItem as any, {} as any);

        await vi.waitFor(() => expect(service.getLog).toHaveBeenCalledTimes(2));
        expect(service.getLog).toHaveBeenNthCalledWith(2, 50, 50);

        const allItems = await provider.getChildren();
        expect(allItems).toHaveLength(75);
        expect(allItems.some((item) => item instanceof LoadMoreItem)).toBe(false);
    });

    it('shows a loading item while the next tree page is being fetched', async () => {
        const commits = Array.from({ length: 75 }, (_, index) => commit(index));
        let resolveNextPage!: () => void;
        const nextPage = new Promise<void>((resolve) => {
            resolveNextPage = resolve;
        });
        const service = {
            getLog: vi.fn(async (limit: number, skip: number) => {
                if (skip === 0) {
                    return commits.slice(skip, skip + limit);
                }
                await nextPage;
                return commits.slice(skip, skip + limit);
            }),
            getCommitFiles: vi.fn(async () => []),
            getWorkingDirectory: vi.fn(() => '/workspace'),
        };
        const provider = new CommitHistoryProvider(service as any);

        await provider.getChildren();
        const loadMorePromise = provider.loadMore();
        const loadingItems = await provider.getChildren();
        const loadingItem = loadingItems.at(-1) as LoadMoreItem;

        expect(loadingItem).toBeInstanceOf(LoadMoreItem);
        expect(loadingItem.label).toBe('Loading commits...');
        expect(loadingItem.command).toBeUndefined();

        resolveNextPage();
        await loadMorePromise;
    });

    it('reuses loaded commit files until the history is refreshed', async () => {
        const commits = [commit(1)];
        const service = {
            getLog: vi.fn(async (limit: number, skip: number) => commits.slice(skip, skip + limit)),
            getCommitFiles: vi.fn(async () => [{ status: 'M', filePath: 'src/file.ts' }]),
            getWorkingDirectory: vi.fn(() => '/workspace'),
        };
        const provider = new CommitHistoryProvider(service as any);

        const [item] = await provider.getChildren();
        await provider.getChildren(item);
        await provider.getChildren(item);

        expect(service.getCommitFiles).toHaveBeenCalledTimes(1);

        provider.refresh();
        const [refreshedItem] = await provider.getChildren();
        await provider.getChildren(refreshedItem);

        expect(service.getCommitFiles).toHaveBeenCalledTimes(2);
    });
});
