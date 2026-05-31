import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getFixtureRepoPath, gitFixtureOutput } from '../../helpers/fixtureRepo';
import { runTestCases } from '../../helpers/testRunner';

export function run(): Promise<void> {
    return runTestCases('Look Git E2E', [
        {
            name: 'opens the Look Git Activity Bar views',
            run: async () => {
                await vscode.commands.executeCommand('workbench.view.extension.look-git');
                await vscode.commands.executeCommand('lookGit.changesView.focus');
                await vscode.commands.executeCommand('lookGit.commitHistory.focus');
                const commands = await vscode.commands.getCommands(true);
                assert.ok(commands.includes('lookGit.changesView.focus'));
                assert.ok(commands.includes('lookGit.commitHistory.focus'));
            },
        },
        {
            name: 'finds the fixture repository used for submodule E2E coverage',
            run: async () => {
                const fixturePath = getFixtureRepoPath();
                if (!fixturePath) {
                    console.log('  skip fixture workspace assertion: fixture repo is absent');
                    return;
                }
                assert.ok(fs.existsSync(path.join(fixturePath, '.git')));
            },
        },
        {
            name: 'focuses Changes against the dirty fixture repository with submodules',
            run: async () => {
                const fixturePath = getFixtureRepoPath();
                if (!fixturePath) {
                    console.log('  skip dirty fixture assertion: fixture repo is absent');
                    return;
                }
                await vscode.commands.executeCommand('workbench.view.extension.look-git');
                await vscode.commands.executeCommand('lookGit.changesView.focus');

                const status = gitFixtureOutput(['status', '--short']);
                assert.match(status, /^M  src\/graphFilter\.ts/m);
                assert.match(status, /^ m modules\/auth-kit/m);
                assert.match(status, /^ m modules\/billing-core/m);
                assert.match(status, /^ m modules\/analytics-adapter/m);
            },
        },
        {
            name: 'opens the Git Graph panel view',
            run: async () => {
                await vscode.commands.executeCommand('lookGit.graphView.focus');
                const commands = await vscode.commands.getCommands(true);
                assert.ok(commands.includes('lookGit.graphView.focus'));
            },
        },
        {
            name: 'bundles official Codicons with a webview-safe relative font URL',
            run: async () => {
                const extension = vscode.extensions.getExtension('mathias8dev.look-git');
                assert.ok(extension, 'Expected the Look Git extension to be available.');

                const webviewDist = path.join(extension.extensionPath, 'dist', 'webview');
                const styles = fs.readFileSync(path.join(webviewDist, 'styles.css'), 'utf8');

                assert.ok(fs.existsSync(path.join(webviewDist, 'codicon.ttf')), 'Expected codicon.ttf to be bundled.');
                assert.match(styles, /@font-face\{font-family:codicon/);
                assert.match(styles, /url\(\.\/codicon\.ttf\?/);
                assert.doesNotMatch(styles, /url\(\/codicon\.ttf/);
                assert.match(styles, /\.submodule-panel/);
                assert.match(styles, /\.submodule-badge-dirty/);
            },
        },
    ]);
}
