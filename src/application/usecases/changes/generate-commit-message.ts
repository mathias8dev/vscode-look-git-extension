import type { CommitMessageGenerator } from '../../ports/commit-message-generator';
import type { GitRepository } from '../../ports/git-repository';
import { parseNameStatusZ } from '../../../core/parsing/parseNameStatus';

const MAX_STAGED_DIFF_LENGTH = 32000;
const RECENT_COMMIT_COUNT = 20;

export interface GenerateCommitMessageResult {
    readonly message: string;
}

export class GenerateCommitMessageUseCase {
    constructor(private readonly generator: CommitMessageGenerator) {}

    async execute(repo: GitRepository, signal?: AbortSignal): Promise<GenerateCommitMessageResult> {
        const [nameStatusRaw, diffStat, stagedDiff, recentCommitSubjectsRaw] = await Promise.all([
            repo.execRaw(['diff', '--cached', '--name-status', '-z', '--'], signal),
            repo.exec(['diff', '--cached', '--stat', '--'], signal),
            repo.execRaw(['diff', '--cached', '--find-renames', '--find-copies', '--unified=3', '--'], signal),
            readRecentCommitSubjects(repo, signal),
        ]);

        const changedFiles = parseNameStatusZ(nameStatusRaw).map((file) => {
            const status = file.origPath ? `${file.status} ${file.origPath} -> ${file.filePath}` : `${file.status} ${file.filePath}`;
            return status.trim();
        });
        if (changedFiles.length === 0 && !diffStat.trim() && !stagedDiff.trim()) {
            throw new Error('Stage changes before generating a commit message.');
        }

        const truncatedDiff = truncateText(stagedDiff, MAX_STAGED_DIFF_LENGTH);
        const rawMessage = await this.generator.generateCommitMessage({
            changedFiles,
            diffStat,
            stagedDiff: truncatedDiff.text,
            stagedDiffTruncated: truncatedDiff.truncated,
            recentCommitSubjects: splitLines(recentCommitSubjectsRaw),
        }, signal);

        return { message: normalizeGeneratedCommitMessage(rawMessage) };
    }
}

export function normalizeGeneratedCommitMessage(rawMessage: string): string {
    const withoutFence = stripCodeFence(rawMessage.trim());
    const fromJson = commitMessageFromJson(withoutFence);
    const normalized = normalizeCommitLines(fromJson ?? withoutFence);
    const conventionalStart = findConventionalCommitStart(normalized);
    const candidate = conventionalStart >= 0
        ? normalizeCommitLines(normalized.split('\n').slice(conventionalStart).join('\n'))
        : normalized;
    if (!candidate) {
        throw new Error('The language model returned an empty commit message.');
    }
    return candidate;
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

function stripCodeFence(value: string): string {
    const match = value.match(/^```(?:json|text)?\s*([\s\S]*?)\s*```$/i);
    return match?.[1]?.trim() ?? value;
}

function commitMessageFromJson(value: string): string | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === 'string') { return parsed; }
        if (!isRecord(parsed)) { return undefined; }
        if (typeof parsed.message === 'string') { return parsed.message; }
        if (typeof parsed.subject === 'string') {
            const body = typeof parsed.body === 'string' ? parsed.body : '';
            return body.trim() ? `${parsed.subject}\n\n${body}` : parsed.subject;
        }
        return undefined;
    } catch {
        return undefined;
    }
}

function normalizeCommitLines(value: string): string {
    const lines = value
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trimEnd());
    while (lines[0]?.trim() === '') { lines.shift(); }
    while (lines[lines.length - 1]?.trim() === '') { lines.pop(); }
    return lines.join('\n').trim();
}

function findConventionalCommitStart(value: string): number {
    const lines = value.split('\n');
    return lines.findIndex((line) => /^(feat|fix|refactor|test|docs|build|chore)(\([^)]+\))?!?:\s+\S/.test(line.trim()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isAbortError(error: unknown): boolean {
    return isRecord(error) && error.name === 'AbortError';
}
