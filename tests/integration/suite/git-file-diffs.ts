import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { gitBlobUri, registerGitBlobFileSystemProvider } from '@extension/utils/git-blob-file-system';
import { refBlobUri } from '@extension/utils/diff-uris';
import { createTempGitRepo } from '@tests/helpers/git-repo';

export async function verifyGitFileDiffs(): Promise<void> {
    const fixture = createTempGitRepo();
    const registration = registerGitBlobFileSystemProvider();
    const encodingConfig = vscode.workspace.getConfiguration('files');
    const previousEncoding = encodingConfig.inspect<string>('encoding')?.workspaceValue;
    try {
        const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('été\n', 'utf16le')]);
        const latin = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]);
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xQAAAAASUVORK5CYII=', 'base64');
        fixture.writeBuffer('utf16.txt', utf16);
        fixture.writeBuffer('latin.txt', latin);
        fixture.writeBuffer('image.png', png);
        fixture.commit('Encoded files');
        const repository = new RuntimeGitRepository({ repoId: fixture.cwd, cwd: fixture.cwd, gitDir: path.join(fixture.cwd, '.git'), kind: 'main', label: 'Encoded diffs' });
        const uri = await refBlobUri(repository, 'HEAD', 'utf16.txt', 'before');
        const repeated = await refBlobUri(repository, 'HEAD', 'utf16.txt', 'before');
        assert.equal(uri.toString(), repeated.toString());
        assert.deepEqual(Buffer.from(await vscode.workspace.fs.readFile(uri)), utf16);
        assert.equal((await vscode.workspace.openTextDocument(uri)).getText(), 'été\n');

        await encodingConfig.update('encoding', 'windows1252', vscode.ConfigurationTarget.Workspace);
        const latinUri = await refBlobUri(repository, 'HEAD', 'latin.txt', 'before');
        assert.equal((await vscode.workspace.openTextDocument(latinUri)).getText(), 'café\n');

        const imageUri = await refBlobUri(repository, 'HEAD', 'image.png', 'before');
        assert.deepEqual(Buffer.from(await vscode.workspace.fs.readFile(imageUri)), png);
        await vscode.commands.executeCommand('vscode.open', imageUri);
        await waitForTab(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.toString() === imageUri.toString(), 'Native image preview');
        const otherImage = gitBlobUri('HEAD', path.join(fixture.cwd, 'image.png'), 'after', png);
        await vscode.commands.executeCommand('vscode.diff', imageUri, otherImage, 'Image revisions');
        await waitForTab(tab => tab.label === 'Image revisions', 'Native image diff');

        const large = Buffer.alloc(12 * 1024 * 1024, 0x61);
        fixture.writeBuffer('large.txt', large);
        fixture.commit('Large text');
        const largeUri = await refBlobUri(repository, 'HEAD', 'large.txt', 'before');
        assert.equal((await vscode.workspace.openTextDocument(largeUri)).getText().length, large.length);
        const second = gitBlobUri('HEAD', path.join(fixture.cwd, 'utf16.txt'), 'before', Buffer.from('new snapshot'));
        assert.notEqual(uri.toString(), second.toString());
        assert.deepEqual(Buffer.from(await vscode.workspace.fs.readFile(uri)), utf16);
        await assert.rejects(Promise.resolve(vscode.workspace.fs.writeFile(uri, Buffer.from('overwrite'))));
        assert.equal(fixture.gitTrim(['status', '--porcelain']), '');
    } finally {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await encodingConfig.update('encoding', previousEncoding, vscode.ConfigurationTarget.Workspace);
        registration.dispose();
        fixture.cleanup();
    }
}

async function waitForTab(matches: (tab: vscode.Tab) => boolean, description: string): Promise<void> {
    const hasTab = () => vscode.window.tabGroups.all.some(group => group.tabs.some(matches));
    if (hasTab()) { return; }
    await new Promise<void>((resolve, reject) => {
        const listener = vscode.window.tabGroups.onDidChangeTabs(() => {
            if (!hasTab()) { return; }
            clearTimeout(timer);
            listener.dispose();
            resolve();
        });
        const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error(`${description} did not open. Tabs: ${vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => tab.label)).join(', ')}`));
        }, 5000);
    });
}
