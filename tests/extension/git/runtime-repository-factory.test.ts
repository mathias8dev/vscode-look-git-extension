import { describe, expect, it } from 'vitest';
import { RuntimeRepositoryFactory } from '../../../src/extension/git/runtime-repository-factory';
import { RepoKind, type RepoContext } from '../../../src/core/git/domain/RepoContext';
import type { GitRuntime } from '../../../src/application/ports/git-runtime';
import type { GitRepository } from '../../../src/application/ports/git-repository';
import type { GitWorktree } from '../../../src/core/git/domain/GitWorktree';
import { stableRepoContextId } from '../../../src/extension/repositories/repo-context-id';

const runtime = {
    supports: () => false,
    execute: async () => undefined,
} satisfies GitRuntime;

describe('RuntimeRepositoryFactory', () => {
    it('creates runtime repositories from existing repository contexts', async () => {
        const factory = new RuntimeRepositoryFactory(runtime);
        const repository = await factory.createRepository(legacyRepository(), {
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(repository).toMatchObject({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
            runtime,
        });
    });

    it('creates runtime worktrees with head, branch, and dirty facts', async () => {
        const factory = new RuntimeRepositoryFactory(runtime);
        const worktree = await factory.createMainWorktree(legacyRepository({
            status: {
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'a.ts' }],
                unstaged: [],
                conflicts: [],
                conflictState: 'none',
            },
        }), {
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(worktree).toMatchObject({
            repoId: 'repo',
            worktreeId: 'repo',
            path: '/repo',
            isMain: true,
            head: 'abc123',
            branch: 'main',
            dirty: true,
            runtime,
        });
    });

    it('uses parent repository id for linked worktree contexts', async () => {
        const factory = new RuntimeRepositoryFactory(runtime);
        const context = {
            id: 'worktree',
            cwd: '/repo-linked',
            kind: RepoKind.Worktree,
            parentId: 'repo',
            label: 'repo-linked',
        } satisfies RepoContext;

        const repository = await factory.createRepository(legacyRepository({ cwd: '/repo-linked' }), context);
        const worktree = await factory.createMainWorktree(legacyRepository({ cwd: '/repo-linked' }), context);

        expect(repository.repoId).toBe('repo');
        expect(worktree.repoId).toBe('repo');
        expect(worktree.worktreeId).toBe('worktree');
        expect(worktree.isMain).toBe(false);
    });

    it('creates runtime worktrees for linked worktrees discovered from the repository', async () => {
        const factory = new RuntimeRepositoryFactory(runtime);
        const worktrees = await factory.createWorktrees(legacyRepository({
            worktrees: [
                gitWorktree('/repo', 'abc123', 'refs/heads/main', true),
                gitWorktree('/repo-linked', 'def456', 'refs/heads/feature/linked', false),
            ],
            rawStatusByCwd: {
                '/repo-linked': ' M linked.ts\0',
            },
        }), {
            id: 'repo',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        });

        expect(worktrees).toHaveLength(2);
        expect(worktrees[1]).toMatchObject({
            repoId: 'repo',
            worktreeId: stableRepoContextId('/repo-linked'),
            path: '/repo-linked',
            isMain: false,
            head: 'def456',
            branch: 'refs/heads/feature/linked',
            dirty: true,
            runtime,
        });
    });

    it('maps submodule contexts to submodule repositories', async () => {
        const factory = new RuntimeRepositoryFactory(runtime);
        const repository = await factory.createRepository(legacyRepository({ cwd: '/repo/sub' }), {
            id: 'sub',
            cwd: '/repo/sub',
            kind: RepoKind.Submodule,
            parentId: 'repo',
            label: 'sub',
        });

        expect(repository).toMatchObject({
            repoId: 'sub',
            kind: 'submodule',
        });
    });
});

function legacyRepository(overrides: Partial<{
    readonly cwd: string;
    readonly currentBranch: string;
    readonly status: Awaited<ReturnType<GitRepository['getStatus']>>;
    readonly worktrees: readonly GitWorktree[];
    readonly rawStatusByCwd: Readonly<Record<string, string>>;
}> = {}): GitRepository {
    const status = overrides.status ?? {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
    };

    return {
        cwd: overrides.cwd ?? '/repo',
        getGitDir: async () => `${overrides.cwd ?? '/repo'}/.git`,
        exec: async (args) => {
            if (args.join(' ') === 'rev-parse HEAD') { return 'abc123'; }
            if (args[0] === '--no-optional-locks' && args[1] === '-C' && args[3] === 'rev-parse' && args[4] === '--git-dir') {
                return `${args[2]}/.git`;
            }
            throw new Error(`Unexpected args: ${args.join(' ')}`);
        },
        execRaw: async (args) => {
            if (args[0] === '--no-optional-locks' && args[1] === '-C' && args[3] === 'status') {
                return overrides.rawStatusByCwd?.[args[2] ?? ''] ?? '';
            }
            throw new Error(`Unexpected raw args: ${args.join(' ')}`);
        },
        getCurrentBranch: async () => overrides.currentBranch ?? 'main',
        getStatus: async () => status,
        listWorktrees: async () => overrides.worktrees ?? [],
    } as GitRepository;
}

function gitWorktree(path: string, head: string, branch: string | undefined, isMain: boolean): GitWorktree {
    return {
        path,
        head,
        branch,
        isMain,
        isDetached: branch === undefined,
        isLocked: false,
    };
}
