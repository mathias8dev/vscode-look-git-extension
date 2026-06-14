import type { RewordCommitMessageGenerator } from '../../ports/commit-message-generator';
import type { GitRepository } from '../../ports/git-repository';
import { parseNameStatusZ } from '../../../core/parsing/parseNameStatus';
import { normalizeGeneratedCommitMessage } from '../commit-message-normalization';

const MAX_COMMIT_DIFF_LENGTH = 32000;
const RECENT_COMMIT_COUNT = 20;

export interface GenerateRewordCommitMessageResult {
    readonly message: string;
}

export class GenerateRewordCommitMessageUseCase {
    constructor(private readonly generator: RewordCommitMessageGenerator) {}

    async execute(repo: GitRepository, commitHash: string, currentMessage: string, signal?: AbortSignal): Promise<GenerateRewordCommitMessageResult> {
        const [nameStatusRaw, diffStat, commitDiff, recentCommitSubjectsRaw] = await Promise.all([
            repo.execRaw(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--root', commitHash], signal),
            repo.exec(['show', '--stat', '--format=', '--find-renames', '--find-copies', commitHash], signal),
            repo.execRaw(['show', '--format=', '--find-renames', '--find-copies', '--unified=3', commitHash], signal),
            readRecentCommitSubjects(repo, signal),
        ]);

        const changedFiles = parseNameStatusZ(nameStatusRaw).map((file) => {
            const status = file.origPath ? `${file.status} ${file.origPath} -> ${file.filePath}` : `${file.status} ${file.filePath}`;
            return status.trim();
        });
        if (changedFiles.length === 0 && !diffStat.trim() && !commitDiff.trim()) {
            throw new Error('No commit changes were found to generate a message.');
        }

        const truncatedDiff = truncateText(commitDiff, MAX_COMMIT_DIFF_LENGTH);
        const rawMessage = await this.generator.generateRewordCommitMessage({
            currentMessage,
            changedFiles,
            diffStat,
            commitDiff: truncatedDiff.text,
            commitDiffTruncated: truncatedDiff.truncated,
            recentCommitSubjects: splitLines(recentCommitSubjectsRaw),
        }, signal);

        return { message: normalizeGeneratedCommitMessage(rawMessage) };
    }
}

function splitLines(value: string): readonly string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

async function readRecentCommitSubjects(repo: GitRepository, signal?: AbortSignal): Promise<string> {
    try {
        return await repo.exec(['log', '-n', String(RECENT_COMMIT_COUNT), '--pretty=format:%s'], signal);
    } catch (error) {
        if (isAbortError(error)) { throw error; }
        return '';
    }
}

function truncateText(value: string, maxLength: number): { readonly text: string; readonly truncated: boolean } {
    if (value.length <= maxLength) { return { text: value, truncated: false }; }
    return { text: value.slice(0, maxLength), truncated: true };
}

function isAbortError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'name' in error
        && error.name === 'AbortError';
}
