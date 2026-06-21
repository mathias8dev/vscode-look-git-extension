import type * as vscode from 'vscode';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLookGitStorage, resetLookGitStorage } from '@extension/storage/look-git-storage';
import { resetMockVscode, Uri, workspace } from '@tests/mocks/vscode';

describe('Look Git storage migration', () => {
    beforeEach(() => {
        resetMockVscode();
    });

    it('clears Look Git memento keys and storage files when schema is missing', async () => {
        const globalState = memento({ 'lookGit.old': 'stale', 'other.key': 'kept' });
        const workspaceState = memento({ 'lookGit.workspace': 'stale' });
        const context = extensionContext(globalState, workspaceState);
        workspace.fs.files.set('/global/cache.json', new Uint8Array([1]));
        workspace.fs.files.set('/workspace/cache.json', new Uint8Array([2]));

        await migrateLookGitStorage(context);

        expect(globalState.values()).toEqual({ 'other.key': 'kept', 'lookGit.storageSchemaVersion': 1 });
        expect(workspaceState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1 });
        expect(workspace.fs.files.size).toBe(0);
    });

    it('does not clear storage after the current schema has already been written', async () => {
        const globalState = memento({ 'lookGit.storageSchemaVersion': 1, 'lookGit.cached': 'kept' });
        const workspaceState = memento({ 'lookGit.storageSchemaVersion': 1, 'lookGit.workspace': 'kept' });
        const context = extensionContext(globalState, workspaceState);
        workspace.fs.files.set('/global/cache.json', new Uint8Array([1]));

        await migrateLookGitStorage(context);

        expect(globalState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1, 'lookGit.cached': 'kept' });
        expect(workspaceState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1, 'lookGit.workspace': 'kept' });
        expect(workspace.fs.files.has('/global/cache.json')).toBe(true);
    });

    it('treats missing VS Code userdata storage as empty', async () => {
        const readDirectory = workspace.fs.readDirectory;
        workspace.fs.readDirectory = () => Promise.reject(new Error("Unable to resolve nonexistent file 'vscode-userdata:/tmp/globalStorage/mathias8dev.look-git'."));
        try {
            const globalState = memento({});
            const workspaceState = memento({});
            const context = extensionContext(globalState, workspaceState);

            await migrateLookGitStorage(context);

            expect(globalState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1 });
            expect(workspaceState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1 });
        } finally {
            workspace.fs.readDirectory = readDirectory;
        }
    });

    it('resets Look Git state on demand', async () => {
        const globalState = memento({ 'lookGit.cached': 'stale', 'other.key': 'kept' });
        const workspaceState = memento({ 'lookGit.workspace': 'stale' });
        const context = extensionContext(globalState, workspaceState);
        workspace.fs.files.set('/global/cache.json', new Uint8Array([1]));

        await resetLookGitStorage(context);

        expect(globalState.values()).toEqual({ 'other.key': 'kept', 'lookGit.storageSchemaVersion': 1 });
        expect(workspaceState.values()).toEqual({ 'lookGit.storageSchemaVersion': 1 });
        expect(workspace.fs.files.size).toBe(0);
    });
});

function extensionContext(globalState: TestMemento, workspaceState: TestMemento): vscode.ExtensionContext {
    return {
        globalState,
        workspaceState,
        globalStorageUri: Uri.file('/global'),
        storageUri: Uri.file('/workspace'),
    } as unknown as vscode.ExtensionContext;
}

class TestMemento implements vscode.Memento {
    constructor(private readonly data = new Map<string, unknown>()) {}

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.data.has(key) ? this.data.get(key) as T : defaultValue;
    }

    update(key: string, value: unknown): Thenable<void> {
        if (value === undefined) {
            this.data.delete(key);
        } else {
            this.data.set(key, value);
        }
        return Promise.resolve();
    }

    keys(): readonly string[] {
        return [...this.data.keys()];
    }

    values(): Readonly<Record<string, unknown>> {
        return Object.fromEntries(this.data);
    }
}

function memento(values: Readonly<Record<string, unknown>>): TestMemento {
    return new TestMemento(new Map(Object.entries(values)));
}
