import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import type { GraphExtensionToWebviewMessage } from '../../../src/protocol/graph/messages';
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
            name: 'opens graph diffs for added and deleted committed files',
            run: async () => {
                const repoPath = process.env.LOOK_GIT_DIFF_FIXTURE_REPO;
                if (!repoPath) {
                    console.log('  skip graph diff assertion: diff fixture repo is absent');
                    return;
                }

                try {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

                    const repo = new GitProcessRepository(repoPath);
                    const messages: GraphExtensionToWebviewMessage[] = [];
                    const accessor: ActiveRepositoryAccessor = {
                        currentRepository: repo,
                        currentContext: undefined,
                        requireRepository: () => repo,
                    };
                    const router = new GraphMessageRouter(accessor, (message) => { messages.push(message); });
                    const commitHash = git(repoPath, ['rev-parse', 'HEAD']);
                    await waitForGitFileContent(repoPath, 'added.txt', commitHash, 'added content\n');
                    await waitForGitFileContent(repoPath, 'deleted.txt', `${commitHash}~1`, 'base content\n');

                    await router.handle({ type: 'graph/openDiff', filePath: 'added.txt', commitHash, status: 'A' });
                    await waitForTabLabel('added.txt');
                    assertNoGraphError(messages);

                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');

                    await router.handle({ type: 'graph/openDiff', filePath: 'deleted.txt', commitHash, status: 'D' });
                    await waitForTabLabel('deleted.txt');
                    assertNoGraphError(messages);
                } finally {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                }
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

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

async function waitForGitFileContent(repoPath: string, filePath: string, ref: string, expected: string): Promise<void> {
    const uri = gitObjectUri(repoPath, filePath, ref);
    let lastError = '';

    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
            if (content === expected) { return; }
            lastError = `read "${content}"`;
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
        await sleep(100);
    }

    assert.fail(`Expected Git file content for ${filePath} at ${ref}: ${lastError}`);
}

function gitObjectUri(repoPath: string, filePath: string, ref: string): vscode.Uri {
    const uri = vscode.Uri.file(path.join(repoPath, filePath));
    return uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.path, ref }) });
}

async function waitForTabLabel(label: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt++) {
        const tab = vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .find((candidate) => candidate.label.includes(label));
        if (tab) { return; }
        await sleep(100);
    }

    const openLabels = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => tab.label);
    assert.fail(`Expected an open diff tab containing "${label}". Open tabs: ${openLabels.join(', ')}`);
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNoGraphError(messages: readonly GraphExtensionToWebviewMessage[]): void {
    const error = messages.find((message) => message.type === 'graph/error');
    assert.equal(error, undefined, error?.message);
}
