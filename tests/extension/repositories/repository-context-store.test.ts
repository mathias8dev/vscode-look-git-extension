import { describe, expect, it } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import { RepositoryContextStore } from '@extension/repositories/repository-context-store';

describe('RepositoryContextStore', () => {
    it('stores multiple repository contexts without choosing an active fallback', () => {
        const store = new RepositoryContextStore();
        const first = context('first');
        const second = context('second');

        store.setContexts([first, second]);

        expect(store.contexts).toEqual([first, second]);
        expect(store.activeContext).toBeUndefined();
    });

    it('chooses the only repository context as the active fallback', () => {
        const store = new RepositoryContextStore();
        const first = context('first');

        store.setContexts([first]);

        expect(store.contexts).toEqual([first]);
        expect(store.activeContext).toEqual(first);
    });

    it('keeps active repository when rediscovery still contains it', () => {
        const store = new RepositoryContextStore();
        const first = context('first');
        const second = context('second');

        store.setContexts([first, second]);
        store.setActiveContextId(second.id);
        store.setContexts([second, first]);

        expect(store.activeContext).toEqual(second);
    });

    it('falls back when the active repository disappears', () => {
        const store = new RepositoryContextStore();
        const first = context('first');
        const second = context('second');
        const third = context('third');

        store.setContexts([first, second, third]);
        store.setActiveContextId(second.id);
        store.setContexts([first, third]);

        expect(store.activeContext).toBeUndefined();
    });

    it('falls back to the only repository when the active repository disappears', () => {
        const store = new RepositoryContextStore();
        const first = context('first');
        const second = context('second');

        store.setContexts([first, second]);
        store.setActiveContextId(second.id);
        store.setContexts([first]);

        expect(store.activeContext).toEqual(first);
    });
});

function context(id: string): RepoContext {
    return {
        id,
        cwd: `/${id}`,
        kind: RepoKind.Main,
        label: id,
    };
}
