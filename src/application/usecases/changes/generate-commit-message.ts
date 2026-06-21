import type { CommitMessageGenerator } from '@application/ports/commit-message-generator';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { truncateText } from '@core/shared/text';
import { isAbortError } from '@core/shared/type-guards';
import { normalizeGeneratedCommitMessage } from '@application/usecases/commit-message-normalization';

const MAX_STAGED_DIFF_LENGTH = 32000;
const RECENT_COMMIT_COUNT = 20;

export interface GenerateCommitMessageResult {
    readonly message: string;
}


export class GenerateCommitMessageUseCase {
    constructor(private readonly generator: CommitMessageGenerator) {}

    async execute(repository: GitRepository, worktree: Worktree, signal?: AbortSignal): Promise<GenerateCommitMessageResult> {
        const [status, stagedDiff, recentCommitSubjects] = await Promise.all([
            worktree.getStatus(signal),
            worktree.getIndexDiff([], signal),
            readRecentCommitSubjects(repository, signal),
        ]);

        const changedFiles = status.staged.map((file) => {
            const statusLabel = file.origPath ? `${file.indexStatus} ${file.origPath} -> ${file.filePath}` : `${file.indexStatus} ${file.filePath}`;
            return statusLabel.trim();
        });
        if (changedFiles.length === 0 && !stagedDiff.trim()) {
            throw new Error('Stage changes before generating a commit message.');
        }

        const truncatedDiff = truncateText(stagedDiff, MAX_STAGED_DIFF_LENGTH);
        const rawMessage = await this.generator.generateCommitMessage({
            changedFiles,
            diffStat: '',
            stagedDiff: truncatedDiff.text,
            stagedDiffTruncated: truncatedDiff.truncated,
            recentCommitSubjects,
        }, signal);

        return { message: normalizeGeneratedCommitMessage(rawMessage) };
    }
}

async function readRecentCommitSubjects(repo: GitRepository, signal?: AbortSignal): Promise<readonly string[]> {
    try {
        const page = await repo.getCommitGraph({}, { limit: RECENT_COMMIT_COUNT }, signal);
        return page.items.map((commit) => commit.message.split('\n')[0]?.trim() ?? '').filter((line) => line.length > 0);
    } catch (error) {
        if (isAbortError(error)) { throw error; }
        return [];
    }
}
