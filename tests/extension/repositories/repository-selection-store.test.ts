import { describe, expect, it } from 'vitest';
import { RepositorySelectionStore } from '@extension/repositories/repository-selection-store';
import { createRepoContext } from '@extension/repositories/repo-context-factory';

describe('RepositorySelectionStore', () => {
    it('keeps discovered repositories and exposes the selected context', () => {
        const store = new RepositorySelectionStore();
        const first = createRepoContext('/repo-a');
        const second = createRepoContext('/repo-b');

        store.setContexts([first, second]);
        store.selectContext(second.id);

        expect(store.contexts).toEqual([first, second]);
        expect(store.currentContext).toEqual(second);
    });

    it('does not create a repository when selecting an unknown context', () => {
        const store = new RepositorySelectionStore();

        store.selectContext('missing');

        expect(store.contexts).toEqual([]);
        expect(store.currentContext).toBeUndefined();
    });

    it('selects the repository that contains a resource path', () => {
        const store = new RepositorySelectionStore();
        const first = createRepoContext('/repo-a');
        const second = createRepoContext('/repo-b');

        store.setContexts([first, second]);
        store.selectContextForResource('/repo-b/src/file.ts');

        expect(store.currentContext).toEqual(second);
    });

    it('selects the most specific repository for nested module paths', () => {
        const store = new RepositorySelectionStore();
        const parent = createRepoContext('/workspace');
        const module = createRepoContext('/workspace/packages/app');

        store.setContexts([parent, module]);
        store.selectContextForResource('/workspace/packages/app/src/index.ts');

        expect(store.currentContext).toEqual(module);
    });
});
