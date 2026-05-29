export interface HistoryCommit {
    readonly hash: string;
    readonly shortHash: string;
    readonly message: string;
    readonly authorName: string;
    readonly authorDate: string;
}
