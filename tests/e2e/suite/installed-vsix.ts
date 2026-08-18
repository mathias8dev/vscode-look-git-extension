import { execFileSync } from 'node:child_process';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { normalizePathForCompare } from '@tests/helpers/git-repo';

export async function run(): Promise<void> {
    const expectedRepo = requiredDirectoryEnv('LOOK_GIT_INSTALLED_VSIX_REPO');
    const expectedExtensionPath = requiredDirectoryEnv('LOOK_GIT_INSTALLED_EXTENSION_PATH');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(workspaceFolder, 'VS Code did not open the packaged extension fixture.');
    assert.equal(normalizePathForCompare(workspaceFolder.uri.fsPath), normalizePathForCompare(expectedRepo));

    const extension = vscode.extensions.getExtension('mathias8dev.look-git');
    assert.ok(extension, 'Installed Look Git extension is not available.');
    assert.equal(normalizePathForCompare(extension.extensionPath), normalizePathForCompare(expectedExtensionPath));
    await extension.activate();
    assert.equal(extension.isActive, true);

    assertStatus(expectedRepo, [
        'A  src/staged.ts',
        ' M src/core/repository.ts',
        '?? notes/local.md',
    ]);

    await vscode.commands.executeCommand('workbench.view.extension.look-git');
    await vscode.commands.executeCommand('lookGit.changes.refresh');

    assertStatus(expectedRepo, [
        'A  src/staged.ts',
        ' M src/core/repository.ts',
        '?? notes/local.md',
    ]);
}

function assertStatus(repo: string, expectedSnippets: readonly string[]): void {
    const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const snippet of expectedSnippets) {
        assert.ok(status.includes(snippet), `Missing status snippet "${snippet}" in:\n${status}`);
    }
}

function requiredDirectoryEnv(name: string): string {
    const value = process.env[name];
    assert.ok(value, `Missing environment variable ${name}.`);
    assert.ok(fs.existsSync(value), `Missing directory for ${name}: ${value}`);
    return value;
}
