import { describe, expect, it, vi } from 'vitest';
import { RepositoryRefreshCoordinator } from '@extension/repositories/repository-refresh-coordinator';

describe('RepositoryRefreshCoordinator', () => {
    it('starts a fresh changes read while a previous topology refresh is still running', async () => {
        let finishRuntime: (() => void) | undefined;
        const runtime = new Promise<void>(resolve => { finishRuntime = resolve; });
        const refreshRuntime = vi.fn().mockImplementationOnce(() => runtime).mockResolvedValue(undefined);
        const refreshChanges = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({ isReady: () => true, refreshRuntime, refreshChanges, refreshViews: async () => {} });
        const first = coordinator.refresh();
        const next = coordinator.refresh();
        try {
            expect(refreshRuntime).toHaveBeenCalledOnce();
            expect(refreshChanges).toHaveBeenCalledTimes(2);
        } finally { finishRuntime?.(); await Promise.all([first, next]); }
    });
    it('refreshes changes without waiting for slow worktree topology while graph views wait for it', async () => {
        let finishRuntime: (() => void) | undefined;
        const runtime = new Promise<void>(resolve => { finishRuntime = resolve; });
        const refreshChanges = vi.fn(async () => {});
        const refreshViews = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({
            isReady: () => true, refreshRuntime: () => runtime, refreshChanges, refreshViews,
        });
        const refresh = coordinator.refresh();
        try {
            await vi.waitFor(() => expect(refreshChanges).toHaveBeenCalledOnce());
            expect(refreshViews).not.toHaveBeenCalled();
        } finally { finishRuntime?.(); await refresh; }
        expect(refreshViews).toHaveBeenCalledOnce();
    });
    it('skips runtime and view refreshes while the repository runtime is unavailable', async () => {
        const refreshRuntime = vi.fn(async () => {});
        const refreshChanges = vi.fn(async () => {});
        const refreshViews = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({
            isReady: () => false,
            refreshChanges,
            refreshRuntime,
            refreshViews,
        });

        await coordinator.refresh();

        expect(refreshRuntime).not.toHaveBeenCalled();
        expect(refreshChanges).not.toHaveBeenCalled();
        expect(refreshViews).not.toHaveBeenCalled();
    });

    it('coalesces requests received during a refresh into one follow-up refresh', async () => {
        let releaseFirstRefresh: (() => void) | undefined;
        const firstRefresh = new Promise<void>((resolve) => { releaseFirstRefresh = resolve; });
        const refreshRuntime = vi.fn()
            .mockImplementationOnce(async () => firstRefresh)
            .mockResolvedValue(undefined);
        const refreshViews = vi.fn(async () => {});
        const refreshChanges = vi.fn(async () => {});
        const coordinator = new RepositoryRefreshCoordinator({
            isReady: () => true,
            refreshChanges,
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
        expect(refreshChanges).toHaveBeenCalledTimes(3);
    });
});
