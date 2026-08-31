export class CoalescingTask {
    private pending = false;
    private inFlight: Promise<void> | undefined;

    constructor(private readonly task: () => Promise<void>) {}

    async run(): Promise<void> {
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
            await this.task();
        }
    }
}
