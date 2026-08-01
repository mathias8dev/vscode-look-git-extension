interface RepositoryRefreshCoordinatorOptions {
    readonly isReady: () => boolean;
    readonly refreshRuntime: () => Promise<void>;
    readonly refreshViews: () => Promise<void>;
}

export class RepositoryRefreshCoordinator {
    private pending = false;
    private inFlight: Promise<void> | undefined;

    constructor(
        private readonly options: RepositoryRefreshCoordinatorOptions,
    ) {}

    async refresh(): Promise<void> {
        this.pending = true;
        while (this.pending || this.inFlight) {
            if (!this.inFlight) {
                const current = this.drain().finally(() => {
                    if (this.inFlight === current) { this.inFlight = undefined; }
                });
                this.inFlight = current;
            }
            await this.inFlight;
        }
    }

    private async drain(): Promise<void> {
        while (this.pending) {
            this.pending = false;
            if (!this.options.isReady()) { continue; }
            await this.options.refreshRuntime();
            await this.options.refreshViews();
        }
    }
}
