import type { RepoContext } from '@core/git/domain/repo-context';

export interface RepositoryNavigationLifecycle {
    navigationStarted(context: RepoContext | undefined): void;
    prepare(context: RepoContext, signal: AbortSignal): Promise<void>;
    ready(context: RepoContext): Promise<void>;
    unavailable(signal: AbortSignal): Promise<void>;
    failed(context: RepoContext | undefined, error: unknown): void;
}

export class RepositoryNavigationCoordinator {
    private generation = 0;
    private controller: AbortController | undefined;

    constructor(private readonly lifecycle: RepositoryNavigationLifecycle) {}

    async activate(context: RepoContext | undefined): Promise<void> {
        const generation = ++this.generation;
        this.controller?.abort();
        const controller = new AbortController();
        this.controller = controller;
        this.lifecycle.navigationStarted(context);

        if (!context) {
            try {
                await this.lifecycle.unavailable(controller.signal);
            } catch (error) {
                if (!this.isCurrent(generation, controller)) { return; }
                this.lifecycle.failed(undefined, error);
            }
            return;
        }

        try {
            await this.lifecycle.prepare(context, controller.signal);
            if (!this.isCurrent(generation, controller)) { return; }
            await this.lifecycle.ready(context);
        } catch (error) {
            if (!this.isCurrent(generation, controller)) { return; }
            this.lifecycle.failed(context, error);
        }
    }

    dispose(): void {
        this.generation += 1;
        this.controller?.abort();
        this.controller = undefined;
    }

    private isCurrent(generation: number, controller: AbortController): boolean {
        return generation === this.generation && !controller.signal.aborted;
    }
}
