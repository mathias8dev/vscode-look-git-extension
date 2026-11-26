import { createHash } from 'node:crypto';
import * as vscode from 'vscode';

const gitBlobScheme = 'lookgit-blob';

class GitBlobFileSystemProvider implements vscode.FileSystemProvider {
    private readonly contents = new Map<string, Uint8Array>();
    private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this.changes.event;

    watch(): vscode.Disposable { return new vscode.Disposable(() => undefined); }

    stat(uri: vscode.Uri): vscode.FileStat {
        return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: this.getContent(uri).byteLength, permissions: vscode.FilePermission.Readonly };
    }

    readFile(uri: vscode.Uri): Uint8Array {
        return this.getContent(uri).slice();
    }

    private getContent(uri: vscode.Uri): Uint8Array {
        const content = this.contents.get(uri.toString());
        if (!content) { throw vscode.FileSystemError.FileNotFound(uri); }
        return content;
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] { throw vscode.FileSystemError.FileNotADirectory(uri); }
    createDirectory(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri); }
    writeFile(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri); }
    delete(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri); }
    rename(uri: vscode.Uri): void { throw vscode.FileSystemError.NoPermissions(uri); }

    createUri(namespace: string, filePath: string, side: string, content: Uint8Array): vscode.Uri {
        const hash = createHash('sha256').update(content).digest('hex');
        const uri = vscode.Uri.file(filePath).with({ scheme: gitBlobScheme, query: JSON.stringify({ hash, namespace, side }) });
        if (!this.contents.has(uri.toString())) { this.contents.set(uri.toString(), new Uint8Array(content)); }
        return uri;
    }

    clear(): void { this.contents.clear(); }
}

const provider = new GitBlobFileSystemProvider();

export function registerGitBlobFileSystemProvider(): vscode.Disposable {
    const registration = vscode.workspace.registerFileSystemProvider(gitBlobScheme, provider, { isReadonly: true, isCaseSensitive: true });
    return vscode.Disposable.from(registration, new vscode.Disposable(() => provider.clear()));
}

export function gitBlobUri(namespace: string, filePath: string, side: string, content: Uint8Array): vscode.Uri {
    return provider.createUri(namespace, filePath, side, content);
}
