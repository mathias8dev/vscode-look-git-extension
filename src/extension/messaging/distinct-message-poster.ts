export const DISTINCT_MESSAGE_LAST_VALUE_ONLY = 1;

export class DistinctMessagePoster<TMessage, TValue> {
    private readonly valuesByKey = new Map<string, TValue>();

    constructor(
        private readonly postMessage: (message: TMessage) => void,
        private readonly equal: (previous: TValue, next: TValue) => boolean,
        private readonly maxEntries = Number.POSITIVE_INFINITY,
    ) {}

    remember(key: string, value: TValue): void {
        this.valuesByKey.set(key, value);
        this.pruneOldestEntries();
    }

    postIfChanged(key: string, value: TValue, message: TMessage): boolean {
        const previous = this.valuesByKey.get(key);
        if (previous !== undefined && this.equal(previous, value)) { return false; }
        this.valuesByKey.set(key, value);
        this.pruneOldestEntries();
        this.postMessage(message);
        return true;
    }

    reset(key: string): void {
        this.valuesByKey.delete(key);
    }

    clear(): void {
        this.valuesByKey.clear();
    }

    private pruneOldestEntries(): void {
        while (this.valuesByKey.size > this.maxEntries) {
            const oldestKey = this.valuesByKey.keys().next().value;
            if (oldestKey === undefined) { return; }
            this.valuesByKey.delete(oldestKey);
        }
    }
}
