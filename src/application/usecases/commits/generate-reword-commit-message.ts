import type { RewordCommitMessageGenerator } from '@application/ports/commit-message-generator';
import type { GitRepository } from '@application/ports/git-topology';
import { truncateText } from '@core/shared/text';
import { normalizeGeneratedCommitMessage } from '@application/usecases/commit-message-normalization';

const MAX_COMMIT_DIFF_LENGTH = 32000;
const RECENT_COMMIT_COUNT = 20;

export interface GenerateRewordCommitMessageResult {
    readonly message: string;
}


export class GenerateRewordCommitMessageUseCase {
    constructor(private readonly generator: RewordCommitMessageGenerator) {}

    async execute(repo: GitRepository, commitHash: string, currentMessage: string, signal?: AbortSignal): Promise<GenerateRewordCommitMessageResult> {
        const [files, commitDiff, recentCommits] = await Promise.all([
            repo.getCommitFiles(commitHash, signal),
            repo.getCommitPatch(commitHash, signal),
            readRecentCommitSubjects(repo, signal),
        ]);

        const changedFiles = files.map((file) => {
            const status = file.origPath ? `${file.status} ${file.origPath} -> ${file.filePath}` : `${file.status} ${file.filePath}`;
            return status.trim();
        });
        if (changedFiles.length === 0 && !commitDiff.trim()) {
            throw new Error('No commit changes were found to generate a message.');
        }

        const truncatedDiff = truncateText(commitDiff, MAX_COMMIT_DIFF_LENGTH);
        const rawMessage = await this.generator.generateRewordCommitMessage({
            currentMessage,
            changedFiles,
            diffStat: '',
            commitDiff: truncatedDiff.text,
            commitDiffTruncated: truncatedDiff.truncated,
            recentCommitSubjects: recentCommits,
        }, signal);

        return { message: normalizeGeneratedCommitMessage(rawMessage) };
    }
}

async function readRecentCommitSubjects(repo: GitRepository, signal?: AbortSignal): Promise<readonly string[]> {
    try {
        const page = await repo.getCommitGraph({}, { limit: RECENT_COMMIT_COUNT }, signal);
        return page.items.map((c) => c.message.split('\n')[0] ?? '');
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') { throw error; }
        return [];
    }
}
