import { afterEach, describe, expect, it } from 'vitest';
import * as path from 'path';
import type { GitBranch, GitStatus } from '@core/git/domain/git-status';
import type { GitSubmodule, GitWorktree } from '@core/git/domain/git-worktree';
import { RepoKind } from '@core/git/domain/repo-context';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeRepositoryFactory } from '@extension/git/runtime-repository-factory';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { RepositoryRuntimeRegistrar } from '@extension/repositories/repository-runtime-registrar';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('RepositoryRuntimeRegistrar', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('refreshes worktrees in the registry without re-creating the repository', async () => {
        const linkedWorktreePath = '/repo-worktrees/feature';
        const runtime = runtimeWithLinkedWorktrees([]);
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
        const context = createRepoContext('/repo');

        await registrar.registerContext(registry, context);
        expect(registry.worktrees(context.id)).toHaveLength(1);

        runtime.linkedWorktrees = [gitWorktree(linkedWorktreePath, false)];
        await registrar.refreshWorktrees(registry, context);

        const worktrees = registry.worktrees(context.id);
        expect(worktrees).toHaveLength(2);
        expect(worktrees.some((w) => w.path === linkedWorktreePath)).toBe(true);
        expect(registry.resolveRepository({ repoId: context.id, kind: 'main', path: '/repo' })).toBeDefined();
    });

    it('registers the selected repository and initialized submodule repositories', async () => {
        const runtime = runtimeWithSubmodules([
            { path: 'modules/auth-kit', status: ' ' },
        ]);
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
        const context = createRepoContext('/repo');

        await registrar.registerContext(registry, context);

        expect(registry.repositories().map((repo) => repo.repoId)).toEqual([
            context.id,
            stableRepoContextId(path.resolve(context.cwd, 'modules/auth-kit')),
        ]);
    });

    it('registers an initialized repository without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = createRepoContext(repo.cwd);
        const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));

        await registrar.registerContext(registry, context);

        expect(registry.resolveRepository({ repoId: context.id, kind: 'main', path: repo.cwd }).cwd).toBe(repo.cwd);
        expect(registry.worktrees(context.id)).toEqual([
            expect.objectContaining({
                repoId: context.id,
                worktreeId: context.id,
                path: repo.cwd,
                head: 'HEAD',
                branch: 'main',
                dirty: false,
            }),
        ]);
    });

    it('registers an initialized worktree context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'worktree-id',
            cwd: repo.cwd,
            kind: RepoKind.Worktree,
            parentId: 'repo-id',
            label: 'repo-worktree',
        };
        const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));

        await registrar.registerContext(registry, context);

        expect(registry.resolveRepository({ repoId: 'repo-id', kind: 'main', path: repo.cwd }).cwd).toBe(repo.cwd);
        expect(registry.worktrees('repo-id')).toEqual([
            expect.objectContaining({
                repoId: 'repo-id',
                worktreeId: 'worktree-id',
                path: repo.cwd,
                head: 'HEAD',
                branch: 'main',
                dirty: false,
            }),
        ]);
    });

    it('registers an initialized submodule context without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = {
            id: 'submodule-id',
            cwd: repo.cwd,
            kind: RepoKind.Submodule,
            parentId: 'repo-id',
            label: 'auth-kit',
        };
        const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));

        await registrar.registerContext(registry, context);

        expect(registry.resolveRepository({ repoId: 'submodule-id', kind: 'submodule', path: repo.cwd, parentRepoId: 'repo-id' }).cwd).toBe(repo.cwd);
        expect(registry.worktrees('submodule-id')).toEqual([
            expect.objectContaining({
                repoId: 'submodule-id',
                worktreeId: 'submodule-id',
                path: repo.cwd,
                head: 'HEAD',
                branch: 'main',
                dirty: false,
            }),
        ]);
    });

    it('registers initialized submodule repositories without commits from the parent context', async () => {
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtimeWithUnbornSubmodule('modules/auth-kit')));
        const context = createRepoContext('/repo');
        const submodulePath = path.resolve(context.cwd, 'modules/auth-kit');
        const submoduleId = stableRepoContextId(submodulePath);

        await registrar.registerContext(registry, context);

        expect(registry.resolveRepository({ repoId: submoduleId, kind: 'submodule', path: submodulePath, parentRepoId: context.id }).cwd).toBe(submodulePath);
        expect(registry.worktrees(submoduleId)).toEqual([
            expect.objectContaining({
                repoId: submoduleId,
                worktreeId: submoduleId,
                path: submodulePath,
                head: 'HEAD',
                branch: undefined,
                dirty: false,
            }),
        ]);
    });
});

interface MutableLinkedWorktreeRuntime extends GitRuntime {
    linkedWorktrees: GitWorktree[];
}

function runtimeWithLinkedWorktrees(linked: GitWorktree[]): MutableLinkedWorktreeRuntime {
    const rt: MutableLinkedWorktreeRuntime = {
        linkedWorktrees: linked,
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(defaultBranches());
                case 'getStatus':
                    return runtimeResult(cleanStatus());
                case 'listWorktrees':
                    return runtimeResult([gitWorktree(context.cwd), ...rt.linkedWorktrees]);
                case 'listSubmodules':
                    return runtimeResult([]);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
    return rt;
}

function runtimeWithSubmodules(submodules: readonly GitSubmodule[]): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            switch (operation) {
                case 'resolveRef':
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(defaultBranches());
                case 'getStatus':
                    return runtimeResult(cleanStatus());
                case 'listWorktrees':
                    return runtimeResult([gitWorktree(context.cwd)]);
                case 'listSubmodules':
                    return runtimeResult(submodules);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function runtimeWithUnbornSubmodule(submodulePath: string): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            const isSubmoduleContext = context.cwd.endsWith(submodulePath);
            switch (operation) {
                case 'resolveRef':
                    if (isSubmoduleContext) {
                        throw new Error("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.");
                    }
                    return runtimeResult('abc123');
                case 'listBranches':
                    return runtimeResult(isSubmoduleContext ? [] : defaultBranches());
                case 'getStatus':
                    return runtimeResult(cleanStatus());
                case 'listWorktrees':
                    return runtimeResult([isSubmoduleContext
                        ? { ...gitWorktree(context.cwd), head: 'HEAD', branch: undefined, isDetached: false }
                        : gitWorktree(context.cwd)]);
                case 'listSubmodules':
                    return runtimeResult(isSubmoduleContext ? [] : [{ path: submodulePath, status: ' ' }]);
                default:
                    throw new Error(`Unexpected operation: ${operation}`);
            }
        },
    };
}

function runtimeResult<TResult>(value: unknown): TResult {
    return value as TResult; // GitRuntime.execute is generic at call sites; this test fixture returns values matched to each requested operation.
}

function defaultBranches(): readonly GitBranch[] {
    return [{
        name: 'main',
        isRemote: false,
        isCurrent: true,
        hash: 'abc123',
        ahead: 0,
        behind: 0,
    }];
}

function cleanStatus(): GitStatus {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
    };
}

function gitWorktree(worktreePath: string, isMain = true): GitWorktree {
    return {
        path: worktreePath,
        head: 'abc123',
        branch: isMain ? 'refs/heads/main' : 'refs/heads/feature',
        isMain,
        isDetached: false,
        isLocked: false,
    };
}
