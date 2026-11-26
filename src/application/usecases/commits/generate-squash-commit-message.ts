import type { CommitMessageGenerator } from '@application/ports/commit-message-generator';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { normalizeGeneratedCommitMessage } from '@application/usecases/commit-message-normalization';
import { truncateText } from '@core/shared/text';

const MAX_DIFF_LENGTH = 32000;
const MAX_FILES = 100;
const MAX_COMMITS = 20;

export class GenerateSquashCommitMessageUseCase {
    constructor(private readonly generator: CommitMessageGenerator) {}

    async execute(repository: GitRepository, worktree: Worktree, sourceRef: string, signal?: AbortSignal): Promise<string> {
        const [targetHead, sourceHead] = await Promise.all([
            repository.resolveRef(worktree.branch ?? worktree.head, signal),
            repository.resolveRef(sourceRef, signal),
        ]);
        const base = await repository.getMergeBase(targetHead, sourceHead, signal);
        const [files, commits, patch] = await Promise.all([
            repository.listChangedFiles(base, sourceHead, { limit: MAX_FILES }, signal),
            repository.getCommitRange(base, sourceHead, { limit: MAX_COMMITS }, signal),
            repository.compareFiles(base, sourceHead, '.', signal),
        ]);
        if (files.items.length === 0 && !patch.trim()) { throw new Error('No branch changes were found to generate a squash commit message.'); }
        const truncatedDiff = truncateText(patch, MAX_DIFF_LENGTH);
        signal?.throwIfAborted();
        const rawMessage = await this.generator.generateCommitMessage({
            currentMessage: `Squash branch '${sourceRef}'`,
            changedFiles: files.items.map(file => file.origPath ? `${file.status} ${file.origPath} -> ${file.filePath}` : `${file.status} ${file.filePath}`),
            diffStat: `${files.totalCount} files changed, ${files.additions} insertions(+), ${files.deletions} deletions(-)`,
            diff: truncatedDiff.text,
            diffTruncated: truncatedDiff.truncated,
            recentCommitSubjects: commits.items.map(commit => commit.message.split(/\r?\n/)[0] ?? '').filter(Boolean),
        }, signal);
        signal?.throwIfAborted();
        return normalizeGeneratedCommitMessage(rawMessage);
    }
}
