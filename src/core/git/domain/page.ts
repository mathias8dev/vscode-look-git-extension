export type PageDirection = 'forward' | 'backward';

export interface PageCursor {
    readonly kind: string;
    readonly repositoryId: string;
    readonly worktreeId?: string;
    readonly queryHash: string;
    readonly anchor?: string;
    readonly snapshot?: string;
    readonly direction?: PageDirection;
}

export interface PageRequest {
    readonly limit: number;
    readonly encodedCursor?: string;
}

export class Page<T> {
    readonly items: readonly T[];
    readonly hasMore: boolean;
    readonly encodedNextCursor?: string;

    constructor(items: readonly T[], hasMore: boolean, encodedNextCursor?: string) {
        this.items = items;
        this.hasMore = hasMore;
        this.encodedNextCursor = encodedNextCursor;
    }
}
