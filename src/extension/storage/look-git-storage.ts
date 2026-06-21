import * as vscode from 'vscode';

const STORAGE_SCHEMA_VERSION_KEY = 'lookGit.storageSchemaVersion';
const CURRENT_STORAGE_SCHEMA_VERSION = 1;
const LOOK_GIT_KEY_PREFIX = 'lookGit.';

export async function migrateLookGitStorage(context: vscode.ExtensionContext): Promise<void> {
    await Promise.all([
        migrateMemento(context.globalState, context.globalStorageUri),
        migrateMemento(context.workspaceState, context.storageUri),
    ]);
}

export async function resetLookGitStorage(context: vscode.ExtensionContext): Promise<void> {
    await Promise.all([
        clearMemento(context.globalState),
        clearMemento(context.workspaceState),
        clearStorageDirectory(context.globalStorageUri),
        clearStorageDirectory(context.storageUri),
    ]);
    await Promise.all([
        context.globalState.update(STORAGE_SCHEMA_VERSION_KEY, CURRENT_STORAGE_SCHEMA_VERSION),
        context.workspaceState.update(STORAGE_SCHEMA_VERSION_KEY, CURRENT_STORAGE_SCHEMA_VERSION),
    ]);
}

async function migrateMemento(memento: vscode.Memento, storageUri: vscode.Uri | undefined): Promise<void> {
    if (memento.get(STORAGE_SCHEMA_VERSION_KEY) === CURRENT_STORAGE_SCHEMA_VERSION) { return; }

    await Promise.all([
        clearMemento(memento),
        clearStorageDirectory(storageUri),
    ]);
    await memento.update(STORAGE_SCHEMA_VERSION_KEY, CURRENT_STORAGE_SCHEMA_VERSION);
}

async function clearMemento(memento: vscode.Memento): Promise<void> {
    await Promise.all(memento.keys()
        .filter((key) => key.startsWith(LOOK_GIT_KEY_PREFIX))
        .map((key) => memento.update(key, undefined)));
}

async function clearStorageDirectory(storageUri: vscode.Uri | undefined): Promise<void> {
    if (!storageUri) { return; }

    const entries = await readDirectoryOrEmpty(storageUri);
    await Promise.all(entries.map(([name]) => vscode.workspace.fs.delete(vscode.Uri.joinPath(storageUri, name), {
        recursive: true,
        useTrash: false,
    })));
}

async function readDirectoryOrEmpty(uri: vscode.Uri): Promise<readonly [string, vscode.FileType][]> {
    try {
        return await vscode.workspace.fs.readDirectory(uri);
    } catch (error) {
        if (isMissingDirectoryError(error)) { return []; }
        throw error;
    }
}

function isMissingDirectoryError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return message.includes('filenotfound')
        || message.includes('enoent')
        || message.includes('directory not found')
        || message.includes('nonexistent file');
}
