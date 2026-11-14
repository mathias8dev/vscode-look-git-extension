import type { GitFileChange } from '@core/git/domain/git-commit';
import { Page, type PageRequest } from '@core/git/domain/page';

export interface ComparedFile extends GitFileChange {
    readonly additions: number | null;
    readonly deletions: number | null;
    readonly oldRevision?: string;
    readonly newRevision?: string;
}

export interface ChangedFilesPageRequest extends PageRequest {
    readonly search?: string;
}

export class ChangedFilesPage extends Page<ComparedFile> {
    constructor(
        items: readonly ComparedFile[],
        hasMore: boolean,
        encodedNextCursor: string | undefined,
        readonly totalCount: number,
        readonly matchingCount: number,
        readonly additions: number,
        readonly deletions: number,
    ) { super(items, hasMore, encodedNextCursor); }
}
