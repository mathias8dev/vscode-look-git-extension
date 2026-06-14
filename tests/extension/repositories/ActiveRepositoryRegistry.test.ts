import { describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import { ActiveRepositoryRegistry } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
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
});
