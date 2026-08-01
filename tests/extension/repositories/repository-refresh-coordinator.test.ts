import { describe, expect, it, vi } from 'vitest';
import { RepositoryRefreshCoordinator } from '@extension/repositories/repository-refresh-coordinator';

describe('RepositoryRefreshCoordinator', () => {
    it('skips runtime and view refreshes while the repository runtime is unavailable', async () => {
        const refreshRuntime = vi.fn(async () => {});
        const refreshViews = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({
            isReady: () => false,
            refreshRuntime,
            refreshViews,
        });

        await coordinator.refresh();

        expect(refreshRuntime).not.toHaveBeenCalled();
        expect(refreshViews).not.toHaveBeenCalled();
    });

    it('coalesces requests received during a refresh into one follow-up refresh', async () => {
        let releaseFirstRefresh: (() => void) | undefined;
        const firstRefresh = new Promise<void>((resolve) => { releaseFirstRefresh = resolve; });
        const refreshRuntime = vi.fn()
            .mockImplementationOnce(async () => firstRefresh)
            .mockResolvedValue(undefined);
        const refreshViews = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({
            isReady: () => true,
            refreshRuntime,
            refreshViews,
        });

        const initial = coordinator.refresh();
        await vi.waitFor(() => { expect(refreshRuntime).toHaveBeenCalledOnce(); });
        const concurrent = Promise.all([coordinator.refresh(), coordinator.refresh()]);
        releaseFirstRefresh?.();
        await Promise.all([initial, concurrent]);

        expect(refreshRuntime).toHaveBeenCalledTimes(2);
        expect(refreshViews).toHaveBeenCalledTimes(2);
    });
});
