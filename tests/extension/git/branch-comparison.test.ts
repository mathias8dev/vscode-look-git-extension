import { afterEach, describe, expect, it } from 'vitest';
import { GetBranchComparison } from '@application/usecases/branches/get-branch-comparison';
import { createComparisonFixture } from '@tests/helpers/comparison-fixture';
import { createSubmoduleFixture } from '@tests/helpers/git-repo';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import * as path from 'node:path';

describe('branch comparison against real git repositories', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });
    const fixture = () => { const result = createComparisonFixture(); cleanups.push(() => result.repo.cleanup()); return result; };

    it('compares pinned branch revisions with divergence and tip semantics without changing HEAD', async () => {
        const { repo, repository, ancestor, feature } = fixture();
        const usecase = new GetBranchComparison();
        const signal = new AbortController().signal;
        const divergence = await usecase.execute(repository, 'main', 'feature', true, signal);
        const tips = await usecase.execute(repository, 'main', 'feature', false, signal);
        expect(divergence.leftHash).toBe(ancestor);
        expect(divergence.headHash).toBe(feature);
        expect(divergence.files.items.some(file => file.filePath === 'base-only.ts')).toBe(false);
        expect(tips.files.items).toContainEqual(expect.objectContaining({ status: 'D', filePath: 'base-only.ts' }));
        expect(divergence.commitCount).toBe(1);
        expect(divergence.commits.items[0]?.hash).toBe(feature);
        expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
        repo.commitFile('later.txt', 'later\n', 'Move branch');
        expect((await repository.listChangedFiles(divergence.leftHash, divergence.headHash, { limit: 100 })).items).toEqual(divergence.files.items);
    });

    it('paginates and searches including renamed paths while preserving complete statistics', async () => {
        const { repository, ancestor, feature } = fixture();
        const first = await repository.listChangedFiles(ancestor, feature, { limit: 2 });
        const next = await repository.listChangedFiles(ancestor, feature, { limit: 2, encodedCursor: first.encodedNextCursor });
        expect(first.items).toHaveLength(2); expect(next.items).toHaveLength(2);
        expect(next.items.some(file => first.items.some(previous => previous.filePath === file.filePath))).toBe(false);
        const searched = await repository.listChangedFiles(ancestor, feature, { limit: 1, search: 'original' });
        expect(searched.items).toEqual([expect.objectContaining({ status: 'R', filePath: 'src/renamed.ts', origPath: 'src/original.ts', additions: 0, deletions: 0 })]);
        expect(searched.totalCount).toBe(5); expect(searched.matchingCount).toBe(1);
        expect(searched.additions).toBe(3); expect(searched.deletions).toBe(2);
        const binary = await repository.listChangedFiles(ancestor, feature, { limit: 10, search: 'image' });
        expect(binary.items[0]).toEqual(expect.objectContaining({ additions: null, deletions: null }));
        const empty = await repository.listChangedFiles(feature, feature, { limit: 10 });
        expect(empty.totalCount).toBe(0); expect(empty.items).toEqual([]);
    });

    it('returns real per-file patches with literal paths, renames, additions, deletions and binary changes', async () => {
        const { repository, ancestor, feature, repo } = fixture();
        expect(await repository.compareFiles(ancestor, feature, 'src/edited.ts')).toContain('+second');
        expect(await repository.compareFiles(ancestor, feature, 'src/deleted.ts')).toContain('-delete me');
        expect(await repository.compareFiles(ancestor, feature, 'src/新しい file.ts')).toContain('+unicode');
        expect(await repository.compareFiles(ancestor, feature, 'image.bin')).toContain('Binary files');
        repo.git(['checkout', '-q', 'feature']);
        repo.write('literal[1].ts', 'literal\n'); repo.write('literal1.ts', 'other\n'); const head = repo.commit('Literal paths');
        const patch = await repository.compareFiles(feature, head, 'literal[1].ts');
        expect(patch).toContain('+literal'); expect(patch).not.toContain('+other');
    });

    it('detects deleted gitlinks and preserves their before/after revisions', async () => {
        const { parent, subPath, cleanup } = createSubmoduleFixture(); cleanups.push(cleanup);
        const before = parent.gitTrim(['rev-parse', 'HEAD']);
        parent.git(['rm', '-f', subPath]); const after = parent.commit('Remove submodule');
        const repository = new RuntimeGitRepository({ repoId: parent.cwd, cwd: parent.cwd, gitDir: path.join(parent.cwd, '.git'), kind: 'main', label: 'Parent' });
        const files = await repository.listChangedFiles(before, after, { limit: 100 });
        expect(files.items).toContainEqual(expect.objectContaining({ status: 'D', isSubmodule: true, newRevision: '0'.repeat(40) }));
    });

    it('aborts git operations without returning successful data', async () => {
        const { repository } = fixture(); const controller = new AbortController(); controller.abort();
        await expect(new GetBranchComparison().execute(repository, 'main', 'feature', true, controller.signal)).rejects.toThrow();
    });
});
