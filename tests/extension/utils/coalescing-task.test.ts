import { describe, expect, it, vi } from 'vitest';
import { CoalescingTask } from '@extension/utils/coalescing-task';

describe('CoalescingTask', () => {
    it('serializes requests and drains one follow-up task for concurrent requests', async () => {
        const firstTask = deferredVoid();
        let running = 0;
        let maximumRunning = 0;
        const task = vi.fn()
            .mockImplementationOnce(async () => {
                running += 1;
                maximumRunning = Math.max(maximumRunning, running);
                await firstTask.promise;
                running -= 1;
            })
            .mockImplementationOnce(async () => {
                running += 1;
                maximumRunning = Math.max(maximumRunning, running);
                running -= 1;
            });
        const coordinator = new CoalescingTask(task);

        const initial = coordinator.run();
        await vi.waitFor(() => { expect(task).toHaveBeenCalledOnce(); });
        const concurrent = Promise.all([coordinator.run(), coordinator.run()]);
        firstTask.resolve();
        await Promise.all([initial, concurrent]);

        expect(task).toHaveBeenCalledTimes(2);
        expect(maximumRunning).toBe(1);
    });

    it('accepts another request after a failed task', async () => {
        const failure = new Error('scan failed');
        const task = vi.fn()
            .mockRejectedValueOnce(failure)
            .mockResolvedValue(undefined);
        const coordinator = new CoalescingTask(task);

        await expect(coordinator.run()).rejects.toBe(failure);
        await expect(coordinator.run()).resolves.toBeUndefined();

        expect(task).toHaveBeenCalledTimes(2);
    });
});

function deferredVoid(): {
    readonly promise: Promise<void>;
    resolve(): void;
} {
    let resolvePromise = (): void => {};
    const promise = new Promise<void>((resolve) => { resolvePromise = resolve; });
    return {
        promise,
        resolve: resolvePromise,
    };
}
