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
