export interface CommitMessageGeneratorInput {
    readonly currentMessage?: string;
    readonly changedFiles: readonly string[];
    readonly diffStat: string;
    readonly diff: string;
    readonly diffTruncated: boolean;
    readonly recentCommitSubjects: readonly string[];
}

export interface CommitMessageGenerator {
    generateCommitMessage(input: CommitMessageGeneratorInput, signal?: AbortSignal): Promise<string>;
}
