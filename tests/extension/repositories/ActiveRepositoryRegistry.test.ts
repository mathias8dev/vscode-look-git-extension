import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { ActiveRepositoryRegistry } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { RepositoryRegistry } from '../../../src/extension/repositories/RepositoryRegistry';
import { toRepositoryLocator, toWorktreeLocator } from '../../../src/extension/mapping/toProtocol';
import { makeRepositoryMock } from '../../helpers/repositoryMock';

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

    it('does not register runtime objects when no repository is active', async () => {
        const registry = new ActiveRepositoryRegistry();
        const runtimeRegistry = new RepositoryRegistry();

        await registry.registerCurrentRuntimeContext(runtimeRegistry);

        expect(runtimeRegistry.repositories()).toEqual([]);
    });
});
