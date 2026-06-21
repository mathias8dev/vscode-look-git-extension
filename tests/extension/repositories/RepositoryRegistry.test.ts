import { describe, expect, it } from 'vitest';
import type { GitRepository, Worktree } from '@application/ports/git-topology';
import type { GitRuntime } from '@application/ports/git-runtime';
import { RepositoryRegistry, RepositoryResolutionError } from '@extension/repositories/RepositoryRegistry';

const runtime = {
    supports: () => false,
    async execute<_TInput = unknown, TResult = unknown>(): Promise<TResult> {
        return undefined as TResult; // Registry tests never execute runtime results.
    },
} satisfies GitRuntime;

describe('RepositoryRegistry', () => {
    it('resolves repositories and worktrees from locators', () => {
        const registry = new RepositoryRegistry();
        const repository = repositoryModel('repo');
        const worktree = worktreeModel('repo', 'main');

        registry.registerRepository(repository);
        registry.registerWorktree(worktree);

        expect(registry.resolveRepository({ repoId: 'repo', kind: 'main', path: '/repo' })).toBe(repository);
        expect(registry.resolveWorktree({ repoId: 'repo', worktreeId: 'main', path: '/repo' })).toBe(worktree);
    });

    it('indexes worktrees by repository id', () => {
        const registry = new RepositoryRegistry();
        const main = worktreeModel('repo', 'main');
        const linked = worktreeModel('repo', 'linked');

        registry.registerWorktree(main);
        registry.registerWorktree(linked);

        expect(registry.worktrees('repo')).toEqual([main, linked]);
        expect(registry.worktrees('missing')).toEqual([]);
    });

    it('replaces a repository topology without keeping stale worktrees', () => {
        const registry = new RepositoryRegistry();
        const main = worktreeModel('repo', 'main');
        const linked = worktreeModel('repo', 'linked');

        registry.replaceRepository(repositoryModel('repo'), [main, linked]);
        registry.replaceRepository(repositoryModel('repo'), [main]);

        expect(registry.worktrees('repo')).toEqual([main]);
        expect(() => registry.resolveWorktree({ repoId: 'repo', worktreeId: 'linked', path: '/linked' }))
            .toThrow(RepositoryResolutionError);
    });

    it('rejects missing repositories and kind mismatches', () => {
        const registry = new RepositoryRegistry();
        registry.registerRepository(repositoryModel('repo'));

        expect(() => registry.resolveRepository({ repoId: 'missing', kind: 'main', path: '/missing' }))
            .toThrow(RepositoryResolutionError);
        expect(() => registry.resolveRepository({ repoId: 'repo', kind: 'submodule', path: '/repo' }))
            .toThrow(/kind mismatch/);
    });

    it('rejects worktrees that do not belong to the requested repository', () => {
        const registry = new RepositoryRegistry();
        registry.registerWorktree(worktreeModel('repo', 'main'));

        expect(() => registry.resolveWorktree({ repoId: 'other', worktreeId: 'main', path: '/repo' }))
            .toThrow(/does not belong/);
    });

    it('unregisters a repository and its worktrees together', () => {
        const registry = new RepositoryRegistry();
        registry.registerRepository(repositoryModel('repo'));
        registry.registerWorktree(worktreeModel('repo', 'main'));

        registry.unregisterRepository('repo');

        expect(registry.repositories()).toEqual([]);
        expect(registry.worktrees('repo')).toEqual([]);
        expect(() => registry.resolveWorktree({ repoId: 'repo', worktreeId: 'main', path: '/repo' }))
            .toThrow(RepositoryResolutionError);
    });

    it('unregisters child repositories and worktrees with a repository tree', () => {
        const registry = new RepositoryRegistry();
        registry.replaceRepository(repositoryModel('repo'), [worktreeModel('repo', 'main')]);
        registry.replaceRepository(repositoryModel('submodule', 'repo'), [worktreeModel('submodule', 'submodule-main')]);

        registry.unregisterRepositoryTree('repo');

        expect(registry.repositories()).toEqual([]);
        expect(registry.worktrees('repo')).toEqual([]);
        expect(registry.worktrees('submodule')).toEqual([]);
        expect(() => registry.resolveRepository({ repoId: 'submodule', kind: 'submodule', path: '/submodule', parentRepoId: 'repo' }))
            .toThrow(RepositoryResolutionError);
    });
});

function repositoryModel(repoId: string, parentRepositoryId?: string): GitRepository {
    return {
        repoId,
        gitDir: `/${repoId}/.git`,
        kind: parentRepositoryId ? 'submodule' : 'main',
        label: repoId,
        parentRepositoryId,
        runtime,
    } as unknown as GitRepository; // Partial registry fixture: tests only use identity and locator fields.
}

function worktreeModel(repoId: string, worktreeId: string): Worktree {
    return {
        repoId,
        worktreeId,
        path: `/${worktreeId}`,
        isMain: worktreeId === 'main',
        head: 'abc123',
        dirty: false,
        runtime,
    } as unknown as Worktree; // Partial registry fixture: tests only use identity and locator fields.
}
