import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { ActiveRepositoryRegistry } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { RepositoryRegistry } from '../../../src/extension/repositories/RepositoryRegistry';
import { toRepositoryLocator, toWorktreeLocator } from '../../../src/extension/mapping/toProtocol';
import { makeRepositoryMock } from '../../helpers/repositoryMock';
import { stableRepoContextId } from '../../../src/extension/repositories/repo-context-id';

describe('ActiveRepositoryRegistry', () => {
    it('owns and reuses repository instances by normalized root', () => {
        const root = path.resolve('workspace', 'project');
        const created: string[] = [];
        const registry = new ActiveRepositoryRegistry((cwd) => {
            created.push(cwd);
            return makeRepositoryMock({ cwd });
        });

        const first = registry.repositoryForRoot(path.join(root, 'src', '..'));
        const second = registry.repositoryForRoot(root);

        expect(second).toBe(first);
        expect(created).toEqual([root]);
    });

    it('sets the active repository from the registry cache', () => {
        const root = path.resolve('workspace', 'project');
        const repo = makeRepositoryMock({ cwd: root });
        const factory = vi.fn(() => repo);
        const registry = new ActiveRepositoryRegistry(factory);

        registry.setActiveRepository(root);

        expect(registry.currentRepository).toBe(repo);
        expect(registry.requireRepository()).toBe(repo);
        expect(factory).toHaveBeenCalledOnce();
    });

    it('registers the active repository and main worktree in the runtime registry', async () => {
        const root = path.resolve('workspace', 'project');
        const repo = makeRepositoryMock({
            cwd: root,
            exec: vi.fn(async (args) => {
                if (args.join(' ') === 'rev-parse HEAD') { return 'abc123'; }
                return '';
            }),
        });
        const registry = new ActiveRepositoryRegistry(() => repo);
        const runtimeRegistry = new RepositoryRegistry();

        registry.setActiveRepository(root);
        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        const context = registry.currentContext;
        expect(context).toBeDefined();
        if (!context) { throw new Error('Expected current context.'); }
        expect(runtimeRegistry.resolveRepository(toRepositoryLocator(context))).toMatchObject({
            repoId: context.id,
            cwd: root,
            kind: 'main',
        });
        expect(runtimeRegistry.resolveWorktree(toWorktreeLocator(context))).toMatchObject({
            repoId: context.id,
            worktreeId: context.id,
            path: root,
            head: 'abc123',
            branch: 'main',
        });
    });

    it('registers linked worktrees in the runtime registry', async () => {
        const root = path.resolve('workspace', 'project');
        const linked = path.resolve('workspace', 'project-linked');
        const repo = makeRepositoryMock({
            cwd: root,
            exec: vi.fn(async (args) => {
                if (args.join(' ') === 'rev-parse HEAD') { return 'abc123'; }
                if (args[0] === '--no-optional-locks' && args[1] === '-C' && args[3] === 'rev-parse') {
                    return path.join(args[2] ?? '', '.git');
                }
                return '';
            }),
            execRaw: vi.fn(async (args) => {
                if (args[0] === '--no-optional-locks' && args[1] === '-C' && args[2] === linked && args[3] === 'status') {
                    return ' M linked.ts\0';
                }
                return '';
            }),
            listWorktrees: vi.fn(async () => [
                { path: root, head: 'abc123', branch: 'refs/heads/main', isMain: true, isDetached: false, isLocked: false },
                { path: linked, head: 'def456', branch: 'refs/heads/feature/linked', isMain: false, isDetached: false, isLocked: false },
            ]),
        });
        const registry = new ActiveRepositoryRegistry(() => repo);
        const runtimeRegistry = new RepositoryRegistry();

        registry.setActiveRepository(root);
        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        const context = registry.currentContext;
        expect(context).toBeDefined();
        if (!context) { throw new Error('Expected current context.'); }
        expect(runtimeRegistry.worktrees(context.id)).toEqual(expect.arrayContaining([
            expect.objectContaining({
                repoId: context.id,
                worktreeId: stableRepoContextId(linked),
                path: linked,
                head: 'def456',
                branch: 'refs/heads/feature/linked',
                dirty: true,
            }),
        ]));
    });

    it('registers initialized submodules in the runtime registry', async () => {
        const root = path.resolve('workspace', 'project');
        const submodulePath = 'modules/lib';
        const submoduleCwd = path.join(root, submodulePath);
        const repo = makeRepositoryMock({
            cwd: root,
            exec: vi.fn(async (args) => {
                if (args.join(' ') === 'rev-parse HEAD') { return 'abc123'; }
                if (args.join(' ') === `-C ${submodulePath} rev-parse --git-dir`) { return '.git'; }
                if (args.join(' ') === `-C ${submodulePath} rev-parse HEAD`) { return 'sub123'; }
                if (args.join(' ') === `-C ${submodulePath} rev-parse --abbrev-ref HEAD`) { return 'feature/lib'; }
                return '';
            }),
            execRaw: vi.fn(async (args) => {
                if (args.join(' ') === `-C ${submodulePath} status --porcelain=v1 -z -u`) { return ' M lib.ts\0'; }
                if (args.join(' ') === `-C ${submodulePath} submodule status`) { return ''; }
                if (args.join(' ') === `-C ${submodulePath} worktree list --porcelain`) { return ''; }
                return '';
            }),
            getSubmoduleStatus: vi.fn(async () => [{ path: submodulePath, status: ' ' }]),
        });
        const registry = new ActiveRepositoryRegistry(() => repo);
        const runtimeRegistry = new RepositoryRegistry();

        registry.setActiveRepository(root);
        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        const parentContext = registry.currentContext;
        expect(parentContext).toBeDefined();
        if (!parentContext) { throw new Error('Expected current context.'); }
        const submoduleId = stableRepoContextId(submoduleCwd);
        expect(runtimeRegistry.resolveRepository({
            repoId: submoduleId,
            kind: 'submodule',
            path: submoduleCwd,
            parentRepoId: parentContext.id,
        })).toMatchObject({
            repoId: submoduleId,
            cwd: submoduleCwd,
            kind: 'submodule',
            label: 'lib',
        });
        expect(runtimeRegistry.worktrees(submoduleId)).toEqual([expect.objectContaining({
            repoId: submoduleId,
            worktreeId: submoduleId,
            path: submoduleCwd,
            head: 'sub123',
            branch: 'feature/lib',
            dirty: true,
        })]);
    });

    it('does not register uninitialized submodules as runtime contexts', async () => {
        const root = path.resolve('workspace', 'project');
        const submodulePath = 'modules/missing';
        const repo = makeRepositoryMock({
            cwd: root,
            exec: vi.fn(async (args) => {
                if (args.join(' ') === 'rev-parse HEAD') { return 'abc123'; }
                return '';
            }),
            getSubmoduleStatus: vi.fn(async () => [{ path: submodulePath, status: '-' }]),
        });
        const registry = new ActiveRepositoryRegistry(() => repo);
        const runtimeRegistry = new RepositoryRegistry();

        registry.setActiveRepository(root);
        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        expect(runtimeRegistry.repositories().map((repository) => repository.kind)).toEqual(['main']);
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(expect.arrayContaining(['-C', submodulePath]));
    });

    it('does not register runtime objects when no repository is active', async () => {
        const registry = new ActiveRepositoryRegistry();
        const runtimeRegistry = new RepositoryRegistry();

        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        expect(runtimeRegistry.repositories()).toEqual([]);
    });
});
