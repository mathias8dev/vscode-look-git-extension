import type { GitRepository } from '../../ports/git-repository';
import type { GitFileChange } from '../../../core/git/domain/GitCommit';

export interface CommitDetailsResult {
    readonly hash: string;
    readonly fullMessage: string;
    readonly files: readonly GitFileChange[];
}

export class GetCommitDetailsUseCase {
    async execute(repo: GitRepository, hash: string, signal?: AbortSignal): Promise<CommitDetailsResult> {
        const [files, fullMessage] = await Promise.all([
            repo.getCommitFiles(hash, signal),
            repo.getCommitMessage(hash, signal),
        ]);
        return { hash, fullMessage, files };
    }
}
