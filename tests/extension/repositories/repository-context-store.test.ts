import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import { RepositoryContextStore } from '@extension/repositories/repository-context-store';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';

const roots: string[] = [];

describe('RepositoryContextStore', () => {
    afterEach(() => {
        while (roots.length) { removeDirSyncWithRetry(roots.pop()!); }
    });

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

    it('selects an active context when the cwd uses a filesystem alias', () => {
        const store = new RepositoryContextStore();
        const firstRoot = tempRoot();
        const secondRoot = tempRoot();
        const secondLink = tempLink(secondRoot);
        const first = createRepoContext(firstRoot);
        const second = createRepoContext(secondRoot);

        store.setContexts([first, second]);
        store.setActiveContextCwd(secondLink);

        expect(store.activeContext).toEqual(second);
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

function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-context-'));
    roots.push(root);
    return root;
}

function tempLink(target: string): string {
    const linkedRoot = path.join(os.tmpdir(), `look-git-context-link-${process.pid}-${Date.now()}`);
    fs.symlinkSync(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    roots.push(linkedRoot);
    return linkedRoot;
}
