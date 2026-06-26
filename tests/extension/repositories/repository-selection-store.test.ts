import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { RepositorySelectionStore } from '@extension/repositories/repository-selection-store';
import { createRepoContext } from '@extension/repositories/repo-context-factory';
import { removeDirSyncWithRetry } from '@tests/helpers/git-repo';

const roots: string[] = [];

describe('RepositorySelectionStore', () => {
    afterEach(() => {
        while (roots.length) { removeDirSyncWithRetry(roots.pop()!); }
    });

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

    it('selects a repository when the resource path uses a filesystem alias', () => {
        const store = new RepositorySelectionStore();
        const root = tempRoot();
        const app = path.join(root, 'app');
        const filePath = path.join(app, 'src', 'index.ts');
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, 'export const value = true;\n');
        const linkedRoot = tempLink(root);
        const context = createRepoContext(app);

        store.setContexts([context]);
        store.selectContextForResource(path.join(linkedRoot, 'app', 'src', 'index.ts'));

        expect(store.currentContext).toEqual(context);
    });
});

function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-selection-'));
    roots.push(root);
    return root;
}

function tempLink(target: string): string {
    const linkedRoot = path.join(os.tmpdir(), `look-git-selection-link-${process.pid}-${Date.now()}`);
    fs.symlinkSync(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
    roots.push(linkedRoot);
    return linkedRoot;
}
