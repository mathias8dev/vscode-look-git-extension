export interface CommitMessageGeneratorInput {
    readonly changedFiles: readonly string[];
    readonly diffStat: string;
    readonly stagedDiff: string;
    readonly stagedDiffTruncated: boolean;
    readonly recentCommitSubjects: readonly string[];
}

export interface CommitMessageGenerator {
    generateCommitMessage(input: CommitMessageGeneratorInput, signal?: AbortSignal): Promise<string>;
}

export interface RewordCommitMessageGeneratorInput {
    readonly currentMessage: string;
    readonly changedFiles: readonly string[];
    readonly diffStat: string;
    readonly commitDiff: string;
    readonly commitDiffTruncated: boolean;
    readonly recentCommitSubjects: readonly string[];
}

export interface RewordCommitMessageGenerator {
    generateRewordCommitMessage(input: RewordCommitMessageGeneratorInput, signal?: AbortSignal): Promise<string>;
}
