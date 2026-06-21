import { describe, expect, it } from 'vitest';
import { RepoKind } from '@core/git/domain/repo-context';
import { toRepositoryLocator, toWorktreeLocator } from '@extension/mapping/to-protocol';

describe('repo locators', () => {
    it('maps a main repo context to repository and worktree locators', () => {
        const context = {
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        };

        expect(toRepositoryLocator(context)).toEqual({
            repoId: 'repo',
            kind: 'main',
            path: '/repo',
            parentRepoId: undefined,
        });
        expect(toWorktreeLocator(context)).toEqual({
            repoId: 'repo',
            worktreeId: 'repo',
            path: '/repo',
        });
    });

    it('maps a submodule context to a child repository locator', () => {
        const context = {
            id: 'sub',
            cwd: '/repo/sub',
            kind: RepoKind.Submodule,
            parentId: 'repo',
            label: 'sub',
        };

        expect(toRepositoryLocator(context)).toEqual({
            repoId: 'sub',
            kind: 'submodule',
            path: '/repo/sub',
            parentRepoId: 'repo',
        });
        expect(toWorktreeLocator(context)).toEqual({
            repoId: 'repo',
            worktreeId: 'sub',
            path: '/repo/sub',
        });
    });

    it('maps a worktree context as a checkout under its parent repository', () => {
        const context = {
            id: 'worktree',
            cwd: '/repo-linked',
            kind: RepoKind.Worktree,
            parentId: 'repo',
            label: 'repo-linked',
        };

        expect(toRepositoryLocator(context)).toEqual({
            repoId: 'repo',
            kind: 'main',
            path: '/repo-linked',
            parentRepoId: undefined,
        });
        expect(toWorktreeLocator(context)).toEqual({
            repoId: 'repo',
            worktreeId: 'worktree',
            path: '/repo-linked',
        });
    });
});
