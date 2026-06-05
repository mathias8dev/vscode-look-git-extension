import { describe, expect, it, vi } from 'vitest';
import type { DiffExplainerInput } from '../../../../src/application/ports/diff-explainer';
import { ExplainCommitDiffUseCase, normalizeDiffExplanation } from '../../../../src/application/usecases/commits/explain-commit-diff';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('ExplainCommitDiffUseCase', () => {
    it('explains selected commits in chronological order', async () => {
        const explainDiff = vi.fn<(input: DiffExplainerInput, signal?: AbortSignal) => Promise<string>>(async () => 'Commit diff explained.');
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args: readonly string[]) => args[0] === 'rev-list' ? 'newer\nolder' : ''),
            execRaw: vi.fn(async (args: readonly string[]) => `show ${args.at(-1)}\n`),
        });
        const signal = new AbortController().signal;

        const result = await new ExplainCommitDiffUseCase({ explainDiff }).execute(repo, ['older', 'newer'], signal);

        expect(repo.exec).toHaveBeenCalledWith(['rev-list', '--topo-order', 'older', 'newer']);
        expect(repo.execRaw).toHaveBeenNthCalledWith(1, [
            'show',
            '--format=fuller',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--stat',
            '--patch',
            'older',
        ], signal);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, [
            'show',
            '--format=fuller',
            '--find-renames',
            '--find-copies',
            '--unified=3',
            '--stat',
            '--patch',
            'newer',
        ], signal);
        expect(explainDiff).toHaveBeenCalledWith(expect.objectContaining({
            selectionLabel: 'Selected commits',
            selectedItems: ['commit: older', 'commit: newer'],
            diffTruncated: false,
        }), signal);
        expect(explainDiff.mock.calls[0]?.[0].diff).toContain('### Commit older');
        expect(result).toEqual({
            explanation: 'Commit diff explained.',
            selectedCommits: ['commit: older', 'commit: newer'],
            diffTruncated: false,
        });
    });

    it('requires selected commits', async () => {
        const repo = makeRepositoryMock();

        await expect(new ExplainCommitDiffUseCase({
            explainDiff: vi.fn(async () => 'unused'),
        }).execute(repo, [])).rejects.toThrow('Select a commit before explaining its diff.');
        expect(repo.execRaw).not.toHaveBeenCalled();
    });

    it('normalizes fenced markdown responses', () => {
        expect(normalizeDiffExplanation('```markdown\nSummary\n```')).toBe('Summary');
        expect(() => normalizeDiffExplanation('   ')).toThrow('empty diff explanation');
    });
});
