import { CoalescingTask } from '@extension/utils/coalescing-task';

interface RepositoryRefreshCoordinatorOptions {
    readonly isReady: () => boolean;
    readonly refreshRuntime: () => Promise<void>;
    readonly refreshViews: () => Promise<void>;
}

export class RepositoryRefreshCoordinator {
    private readonly task: CoalescingTask;

    constructor(
        private readonly options: RepositoryRefreshCoordinatorOptions,
    ) {
        this.task = new CoalescingTask(() => this.refreshOnce());
    }

    refresh(): Promise<void> {
        return this.task.run();
    }

    private async refreshOnce(): Promise<void> {
        if (!this.options.isReady()) { return; }
        await this.options.refreshRuntime();
        await this.options.refreshViews();
    }
}
