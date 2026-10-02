import { afterEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'node:fs';
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
import { createRepoContext, createSubmoduleRepoContext } from '@extension/repositories/repo-context-factory';
import { stableRepoContextId } from '@extension/repositories/repo-context-id';
import { createSubmoduleFixture, createTempGitRepo, samePath, type TempGitRepo } from '@tests/helpers/git-repo';

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
        await registrar.refreshContext(registry, context);

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

    it('registers a submodule initialized after the parent runtime was registered', async () => {
        const fixture = createSubmoduleFixture();
        try {
            fixture.parent.git(['submodule', 'deinit', '-f', '--', fixture.subPath]);
            const context = createRepoContext(fixture.parent.cwd);
            const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
            const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
            const registry = new RepositoryRegistry();
            await registrar.registerContext(registry, context);
            const parent = registry.repositories()[0];
            fixture.parent.git(['-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--', fixture.subPath]);

            await registrar.refreshContext(registry, context);

            expect(registry.repositories()).toHaveLength(2);
            expect(registry.repositories()[0]).toBe(parent);
        } finally {
            fixture.cleanup();
        }
    });

    it('removes a deinitialized submodule from the runtime registry', async () => {
        const fixture = createSubmoduleFixture();
        try {
            const context = createRepoContext(fixture.parent.cwd);
            const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
            const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
            const registry = new RepositoryRegistry();
            await registrar.registerContext(registry, context);
            const child = registry.repositories().find((repository) => repository.parentRepositoryId === context.id);
            expect(child).toBeDefined();
            fixture.parent.git(['submodule', 'deinit', '-f', '--', fixture.subPath]);

            await registrar.refreshContext(registry, context);

            expect(registry.repositories()).toHaveLength(1);
            expect(registry.worktrees(child?.repoId ?? '')).toEqual([]);
        } finally {
            fixture.cleanup();
        }
    });

    it.each(['direct', 'symlink'] as const)('rejects actions on a stale submodule runtime opened through %s instead of committing in its parent', async (location) => {
        const fixture = createSubmoduleFixture();
        try {
            const context = createRepoContext(fixture.parent.cwd);
            const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
            const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));
            const registry = new RepositoryRegistry();
            await registrar.registerContext(registry, context);
            const child = registry.repositories().find((repository) => repository.parentRepositoryId === context.id);
            let worktree = child && registry.worktrees(child.repoId)[0];
            if (!worktree) { throw new Error('Expected registered submodule worktree.'); }
            if (location === 'symlink') {
                fixture.parent.mkdir('aliases');
                const linkedPath = path.join(fixture.parent.cwd, 'aliases', 'child');
                fs.symlinkSync(path.resolve(fixture.parent.cwd, fixture.subPath), linkedPath, process.platform === 'win32' ? 'junction' : 'dir');
                worktree = await new RuntimeRepositoryFactory(runtime).createMainWorktree(createSubmoduleRepoContext(linkedPath, context.id));
            }
            const parentHead = fixture.parent.gitTrim(['rev-parse', 'HEAD']);
            fixture.parent.git(['submodule', 'deinit', '-f', '--', fixture.subPath]);
            fixture.parent.write('parent-only.txt', 'parent changes\n');
            fixture.parent.git(['add', 'parent-only.txt']);

            await expect(worktree.commit('must not commit in parent', {})).rejects.toThrow();

            expect(fixture.parent.gitTrim(['rev-parse', 'HEAD'])).toBe(parentHead);
            expect(fixture.parent.gitTrim(['diff', '--cached', '--name-only'])).toBe('parent-only.txt');
        } finally {
            fixture.cleanup();
        }
    });

    it('registers an initialized repository without commits', async () => {
        const repo = createTempGitRepo();
        repos.push(repo);
        const context = createRepoContext(repo.cwd);
        const runtime = new CliGitRuntime((args, runtimeContext, options) => new GitCliBackend(runtimeContext.cwd).run(args, options));
        const registry = new RepositoryRegistry();
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtime));

        await registrar.registerContext(registry, context);

        expect(registry.resolveRepository({ repoId: context.id, kind: 'main', path: repo.cwd }).cwd).toBe(context.cwd);
        expect(registry.worktrees(context.id)).toEqual([
            expect.objectContaining({
                repoId: context.id,
                worktreeId: context.id,
                path: context.cwd,
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
        const context = createRepoContext('/repo');
        const relativeSubmodulePath = 'modules/auth-kit';
        const submodulePath = path.resolve(context.cwd, relativeSubmodulePath);
        const submoduleId = stableRepoContextId(submodulePath);
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(
            runtimeWithUnbornSubmodule(submodulePath, relativeSubmodulePath),
        ));

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

    it('keeps the registered runtime intact when replacement preparation is aborted', async () => {
        const context = createRepoContext('/repo');
        const registry = new RepositoryRegistry();
        const initialRegistrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtimeWithLinkedWorktrees([])));
        await initialRegistrar.registerContext(registry, context);
        const initialRepository = registry.repositories()[0];
        const initialWorktree = registry.worktrees(context.id)[0];
        const submodules = deferred<readonly GitSubmodule[]>();
        const replacementRegistrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(
            runtimeWithDeferredSubmodules(submodules.promise),
        ));
        const controller = new AbortController();

        const registration = replacementRegistrar.registerContext(registry, context, controller.signal);
        controller.abort();
        submodules.resolve([]);

        await expect(registration).rejects.toMatchObject({ name: 'AbortError' });
        expect(registry.repositories()).toEqual([initialRepository]);
        expect(registry.worktrees(context.id)).toEqual([initialWorktree]);
    });

    it('reuses unchanged submodule runtimes without loading their status again', async () => {
        const context = createRepoContext('/repo');
        const factory = new RuntimeRepositoryFactory(runtimeWithSubmodules([{ path: 'modules/lib', status: ' ' }]));
        const registrar = new RepositoryRuntimeRegistrar(factory);
        const registry = new RepositoryRegistry();
        await registrar.registerContext(registry, context);
        const child = registry.repositories()[1];
        if (!child) { throw new Error('Expected initialized submodule.'); }
        const childWorktrees = registry.worktrees(child.repoId);
        const createWorktrees = vi.spyOn(factory, 'createWorktrees');

        await registrar.refreshContext(registry, context);

        expect(registry.repositories()[1]).toBe(child);
        expect(registry.worktrees(child.repoId)).toEqual(childWorktrees);
        expect(createWorktrees).toHaveBeenCalledExactlyOnceWith(context, undefined);
    });

    it.each(['abort', 'unregister'] as const)('does not publish a refresh after %s while loading submodules', async (interrupt) => {
        const context = createRepoContext('/repo');
        const registrar = new RepositoryRuntimeRegistrar(new RuntimeRepositoryFactory(runtimeWithLinkedWorktrees([])));
        const registry = new RepositoryRegistry();
        await registrar.registerContext(registry, context);
        const repository = registry.repositories()[0];
        if (!repository) { throw new Error('Expected parent repository.'); }
        const originalWorktrees = registry.worktrees(context.id);
        const submodules = deferred<readonly GitSubmodule[]>();
        vi.spyOn(repository, 'listSubmodules').mockReturnValue(submodules.promise);
        const controller = new AbortController();
        const refresh = registrar.refreshContext(registry, context, controller.signal);
        if (interrupt === 'abort') { controller.abort(); }
        else { registry.unregisterRepositoryTree(context.id); }
        submodules.resolve([]);

        if (interrupt === 'abort') {
            await expect(refresh).rejects.toMatchObject({ name: 'AbortError' });
            expect(registry.worktrees(context.id)).toEqual(originalWorktrees);
        } else {
            await refresh;
            expect(registry.repositories()).toEqual([]);
            expect(registry.worktrees(context.id)).toEqual([]);
        }
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

function runtimeWithDeferredSubmodules(submodules: Promise<readonly GitSubmodule[]>): GitRuntime {
    const runtime = runtimeWithSubmodules([]);
    return {
        ...runtime,
        execute: async <TInput, TResult>(
            operation: SemanticGitOperation,
            context: GitExecutionContext,
            input: TInput,
            signal?: AbortSignal,
        ): Promise<TResult> => {
            if (operation === 'listSubmodules') {
                return runtimeResult(await submodules);
            }
            return runtime.execute<TInput, TResult>(operation, context, input, signal);
        },
    };
}

function runtimeWithUnbornSubmodule(submoduleCwd: string, relativeSubmodulePath: string): GitRuntime {
    return {
        supports: () => true,
        execute: async <_TInput, TResult>(operation: SemanticGitOperation, context: GitExecutionContext): Promise<TResult> => {
            const isSubmoduleContext = samePath(context.cwd, submoduleCwd);
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
                    return runtimeResult(isSubmoduleContext ? [] : [{ path: relativeSubmodulePath, status: ' ' }]);
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

function deferred<T>(): {
    readonly promise: Promise<T>;
    resolve(value: T): void;
} {
    let resolvePromise = (_value: T): void => {};
    const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
    return {
        promise,
        resolve: resolvePromise,
    };
}
