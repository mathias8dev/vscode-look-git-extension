import type { GitFileChange } from '@core/git/domain/git-commit';

export interface CommitDetailsRepository {
    getCommitFiles(commit: string, signal?: AbortSignal): Promise<readonly GitFileChange[]>;
    getCommitMessage(commit: string, signal?: AbortSignal): Promise<string>;
}

export interface CommitDetailsResult {
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: readonly GitFileChange[];
}

export class GetCommitDetailsUseCase {
    async execute(repo: CommitDetailsRepository, hash: string, signal?: AbortSignal): Promise<CommitDetailsResult> {
        const [files, fullMessage] = await Promise.all([
            repo.getCommitFiles(hash, signal),
            repo.getCommitMessage(hash, signal),
        ]);
        return { hash, fullMessage, files };
    }
}
