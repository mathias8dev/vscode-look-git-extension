import { describe, expect, it, vi } from 'vitest';
import type { CommitMessageGeneratorInput } from '@application/ports/commit-message-generator';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import { GenerateSquashCommitMessageUseCase } from '@application/usecases/commits/generate-squash-commit-message';
import { ChangedFilesPage } from '@core/git/domain/git-comparison';
import { GitCommit } from '@core/git/domain/git-commit';
import { Page } from '@core/git/domain/page';

describe('GenerateSquashCommitMessageUseCase', () => {
    it('generates from the source branch since divergence, independently of staged worktree changes', async () => {
        const fixture = setup();
        const controller = new AbortController();

        expect(await fixture.usecase.execute(fixture.repository, fixture.worktree, 'feature', controller.signal)).toBe('feat: combined feature');

        expect(fixture.resolveRef).toHaveBeenCalledWith('refs/heads/linked-target', controller.signal);
        expect(fixture.getMergeBase).toHaveBeenCalledWith('target-head', 'source-head', controller.signal);
        expect(fixture.compareFiles).toHaveBeenCalledWith('base', 'source-head', '.', controller.signal);
        const input = fixture.generate.mock.calls[0]?.[0];
        expect(input?.changedFiles).toEqual(['M feature.txt']);
        expect(input?.diff).toBe('source changes');
        expect(input?.recentCommitSubjects).toEqual(['feat: source feature']);
    });

    it('bounds the model context and reports truncated diffs', async () => {
        const fixture = setup('x'.repeat(40000));

        await fixture.usecase.execute(fixture.repository, fixture.worktree, 'feature');

        const input = fixture.generate.mock.calls[0]?.[0];
        expect(input?.diff).toHaveLength(32000);
        expect(input?.diffTruncated).toBe(true);
        expect(fixture.listChangedFiles).toHaveBeenCalledWith('base', 'source-head', { limit: 100 }, undefined);
        expect(fixture.getCommitRange).toHaveBeenCalledWith('base', 'source-head', { limit: 20 }, undefined);
    });

    it('uses the detached worktree commit instead of the main repository HEAD', async () => {
        const fixture = setup();

        await fixture.usecase.execute(fixture.repository, { ...fixture.worktree, branch: undefined, head: 'detached-head' }, 'feature');

        expect(fixture.resolveRef).toHaveBeenCalledWith('detached-head', undefined);
    });

    it('does not call the model for an empty squash', async () => {
        const fixture = setup('');
        fixture.listChangedFiles.mockResolvedValue(new ChangedFilesPage([], false, undefined, 0, 0, 0, 0));

        await expect(fixture.usecase.execute(fixture.repository, fixture.worktree, 'feature')).rejects.toThrow('No branch changes');

        expect(fixture.generate).not.toHaveBeenCalled();
    });

    it('propagates generation failures for the editor to display', async () => {
        const fixture = setup();
        fixture.generate.mockRejectedValue(new Error('No language model available'));

        await expect(fixture.usecase.execute(fixture.repository, fixture.worktree, 'feature')).rejects.toThrow('No language model available');
    });

    it('discards a model response if generation has been cancelled', async () => {
        const fixture = setup();
        const controller = new AbortController();
        fixture.generate.mockImplementation(async () => {
            controller.abort();
            return '{"message":"feat: late response"}';
        });

        await expect(fixture.usecase.execute(fixture.repository, fixture.worktree, 'feature', controller.signal)).rejects.toThrow();
    });
});

function setup(diff = 'source changes') {
    const generate = vi.fn<(input: CommitMessageGeneratorInput, signal?: AbortSignal) => Promise<string>>(async () => '{"message":"feat: combined feature"}');
    const resolveRef = vi.fn(async (ref: string) => ref === 'feature' ? 'source-head' : 'target-head');
    const getMergeBase = vi.fn(async () => 'base');
    const listChangedFiles = vi.fn(async () => new ChangedFilesPage([{ filePath: 'feature.txt', status: 'M', additions: 1, deletions: 0 }], false, undefined, 1, 1, 1, 0));
    const getCommitRange = vi.fn(async () => new Page([new GitCommit({ hash: 'source-head', shortHash: 'source', message: 'feat: source feature\n\nbody', authorName: 'Author', authorEmail: 'author@example.test', authorDate: '2026-11-26T10:00:00Z', parentHashes: ['base'] })], false));
    const compareFiles = vi.fn(async () => diff);
    const repository = { resolveRef, getMergeBase, listChangedFiles, getCommitRange, compareFiles } as unknown as GitRepository; // The use-case only reads these repository capabilities.
    const worktree = { branch: 'refs/heads/linked-target', head: 'cached-head' } as unknown as Worktree; // Only the worktree reference is needed; the index is never read.
    return { usecase: new GenerateSquashCommitMessageUseCase({ generateCommitMessage: generate }), repository, worktree, generate, resolveRef, getMergeBase, listChangedFiles, getCommitRange, compareFiles };
}
