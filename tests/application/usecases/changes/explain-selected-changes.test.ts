import { describe, expect, it, vi } from 'vitest';
import type { DiffExplainerInput } from '../../../../src/application/ports/diff-explainer';
import { ExplainSelectedChangesUseCase, normalizeDiffExplanation } from '../../../../src/application/usecases/changes/explain-selected-changes';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('ExplainSelectedChangesUseCase', () => {
    it('explains staged, unstaged, and untracked selected diffs', async () => {
        const explainDiff = vi.fn<(input: DiffExplainerInput, signal?: AbortSignal) => Promise<string>>(async () => '```markdown\nExplained diff.\n```');
        const untrackedDiff = Object.assign(new Error('diff exits with one'), {
            stdout: 'diff --git a/new.ts b/new.ts\n+new\n',
        });
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--cached')) { return 'diff --git a/staged.ts b/staged.ts\n+staged\n'; }
                if (args.includes('--no-index')) { throw untrackedDiff; }
                return 'diff --git a/app.ts b/app.ts\n+unstaged\n';
            }),
        });
        const signal = new AbortController().signal;

        const result = await new ExplainSelectedChangesUseCase({ explainDiff }).execute(repo, {
            stagedFilePaths: ['staged.ts'],
            unstagedFilePaths: ['app.ts'],
            untrackedFilePaths: ['new.ts'],
        }, signal);

        expect(repo.execRaw).toHaveBeenNthCalledWith(1, [
            'diff',
            '--cached',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'staged.ts',
        ], signal);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, [
            'diff',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--',
            'app.ts',
        ], signal);
        expect(repo.execRaw).toHaveBeenNthCalledWith(3, [
            'diff',
            '--no-index',
            '--unified=3',
            '--',
            '/dev/null',
            'new.ts',
        ], signal);
        expect(explainDiff).toHaveBeenCalledWith(expect.objectContaining({
            selectionLabel: 'Selected files',
            selectedItems: ['staged: staged.ts', 'unstaged: app.ts', 'untracked: new.ts'],
            diffTruncated: false,
        }), signal);
        const generatorInput = explainDiff.mock.calls[0]?.[0];
        expect(generatorInput?.diff).toContain('### Staged changes');
        expect(generatorInput?.diff).toContain('### Unstaged changes');
        expect(generatorInput?.diff).toContain('### Untracked file: new.ts');
        expect(result).toEqual({
            explanation: 'Explained diff.',
            selectedFiles: ['staged: staged.ts', 'unstaged: app.ts', 'untracked: new.ts'],
            diffTruncated: false,
        });
    });

    it('truncates large selected diffs before sending them to the model', async () => {
        const explainDiff = vi.fn<(input: DiffExplainerInput) => Promise<string>>(async () => 'Large diff explained.');
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'x'.repeat(48001)),
        });

        const result = await new ExplainSelectedChangesUseCase({ explainDiff }).execute(repo, {
            stagedFilePaths: ['large.ts'],
            unstagedFilePaths: [],
            untrackedFilePaths: [],
        });

        expect(explainDiff.mock.calls[0]?.[0].diff).toHaveLength(48000);
        expect(explainDiff.mock.calls[0]?.[0].diffTruncated).toBe(true);
        expect(result.diffTruncated).toBe(true);
    });

    it('requires selected files', async () => {
        const repo = makeRepositoryMock();

        await expect(new ExplainSelectedChangesUseCase({
            explainDiff: vi.fn(async () => 'unused'),
        }).execute(repo, {
            stagedFilePaths: [],
            unstagedFilePaths: [],
            untrackedFilePaths: [],
        })).rejects.toThrow('Select changes before explaining a diff.');
        expect(repo.execRaw).not.toHaveBeenCalled();
    });

    it('normalizes fenced markdown responses', () => {
        expect(normalizeDiffExplanation('```md\nSummary\n```')).toBe('Summary');
        expect(() => normalizeDiffExplanation('   ')).toThrow('empty diff explanation');
    });
});
