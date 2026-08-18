import { describe, expect, it, vi } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import {
    RepositoryNavigationCoordinator,
    type RepositoryNavigationLifecycle,
} from '@extension/repositories/repository-navigation-coordinator';

describe('RepositoryNavigationCoordinator', () => {
    it('clears stale content immediately and publishes ready only after preparation finishes', async () => {
        const preparation = deferredVoid();
        const lifecycle = createLifecycle({ prepare: () => preparation.promise });
        const coordinator = new RepositoryNavigationCoordinator(lifecycle);
        const repository = context('repo-a');

        const activation = coordinator.activate(repository);

        expect(lifecycle.navigationStarted).toHaveBeenCalledWith(repository);
        expect(lifecycle.ready).not.toHaveBeenCalled();
        preparation.resolve();
        await activation;
        expect(lifecycle.ready).toHaveBeenCalledWith(repository);
    });

    it('aborts stale preparation and never publishes its repository as ready', async () => {
        const firstPreparation = deferredVoid();
        let firstSignal: AbortSignal | undefined;
        const lifecycle = createLifecycle({
            prepare: (repository, signal) => {
                if (repository.id === 'repo-a') {
                    firstSignal = signal;
                    return firstPreparation.promise;
                }
                return Promise.resolve();
            },
        });
        const coordinator = new RepositoryNavigationCoordinator(lifecycle);
        const firstActivation = coordinator.activate(context('repo-a'));

        await coordinator.activate(context('repo-b'));
        firstPreparation.resolve();
        await firstActivation;

        expect(firstSignal?.aborted).toBe(true);
        expect(lifecycle.ready).toHaveBeenCalledTimes(1);
        expect(lifecycle.ready).toHaveBeenCalledWith(context('repo-b'));
    });

    it('publishes the unavailable state without preparing a runtime', async () => {
        const lifecycle = createLifecycle();
        const coordinator = new RepositoryNavigationCoordinator(lifecycle);

        await coordinator.activate(undefined);

        expect(lifecycle.navigationStarted).toHaveBeenCalledWith(undefined);
        expect(lifecycle.prepare).not.toHaveBeenCalled();
        expect(lifecycle.unavailable).toHaveBeenCalledOnce();
    });

    it('aborts a pending unavailable transition when another repository is selected', async () => {
        const unavailable = deferredVoid();
        let unavailableSignal: AbortSignal | undefined;
        const lifecycle = createLifecycle({
            unavailable: (signal) => {
                unavailableSignal = signal;
                return unavailable.promise;
            },
        });
        const coordinator = new RepositoryNavigationCoordinator(lifecycle);
        const unavailableActivation = coordinator.activate(undefined);

        await coordinator.activate(context('repo-b'));
        unavailable.resolve();
        await unavailableActivation;

        expect(unavailableSignal?.aborted).toBe(true);
        expect(lifecycle.ready).toHaveBeenCalledWith(context('repo-b'));
        expect(lifecycle.failed).not.toHaveBeenCalled();
    });

    it('reports preparation failures only for the current navigation', async () => {
        const failure = new Error('runtime failed');
        const lifecycle = createLifecycle({ prepare: async () => { throw failure; } });
        const coordinator = new RepositoryNavigationCoordinator(lifecycle);
        const repository = context('repo-a');

        await coordinator.activate(repository);

        expect(lifecycle.failed).toHaveBeenCalledWith(repository, failure);
        expect(lifecycle.ready).not.toHaveBeenCalled();
    });
});

function createLifecycle(overrides: Partial<RepositoryNavigationLifecycle> = {}): RepositoryNavigationLifecycle {
    return {
        navigationStarted: vi.fn(),
        prepare: vi.fn(async () => {}),
        ready: vi.fn(async () => {}),
        unavailable: vi.fn(async () => {}),
        failed: vi.fn(),
        ...overrides,
    };
}

function context(id: string): RepoContext {
    return { id, cwd: `/${id}`, kind: RepoKind.Main, label: id };
}

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
