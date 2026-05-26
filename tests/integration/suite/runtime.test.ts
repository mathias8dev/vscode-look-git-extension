import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function activateExtension(): Promise<vscode.Extension<unknown>> {
    const ext = vscode.extensions.getExtension('mathias8dev.look-git');
    assert.ok(ext, 'Extension should be discoverable by publisher/name id.');
    await ext!.activate();
    return ext!;
}

interface FixtureRepo {
    cwd: string;
}

let fixtureRepo: FixtureRepo | undefined;

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBuiltInGitRepo(rootPath: string): Promise<unknown> {
    const gitExtension = vscode.extensions.getExtension('vscode.git');
    assert.ok(gitExtension, 'Built-in Git extension should be installed.');
    const gitExports = await gitExtension!.activate() as { getAPI(version: number): { repositories: Array<{ rootUri: vscode.Uri }> } };
    const api = gitExports.getAPI(1);
    const expected = path.normalize(rootPath);

    for (let attempt = 0; attempt < 50; attempt++) {
        const repo = api.repositories.find((r) => path.normalize(r.rootUri.fsPath) === expected);
        if (repo) {
            return repo;
        }
        await sleep(100);
    }

    assert.fail(`Built-in Git API did not discover fixture repository: ${rootPath}`);
}

async function openEmpty(path: string): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(vscode.Uri.parse(`lookgit-empty:${path}`));
}

function git(rootPath: string, args: string[]): string {
    return execFileSync('git', args, {
        cwd: rootPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

// ---------------------------------------------------------------------------
// Manifest helpers
// ---------------------------------------------------------------------------

function getContributedLookGitCommands(): string[] {
    const extension = vscode.extensions.getExtension('mathias8dev.look-git')!;
    const pkg = extension.packageJSON as {
        contributes?: { commands?: Array<{ command?: string }> };
    };
    return (pkg.contributes?.commands ?? [])
        .map((entry) => entry.command)
        .filter((command): command is string => typeof command === 'string' && command.startsWith('lookGit.'));
}

const VIEW_IDS = [
    'lookGit.commitHistory',
    'lookGit.graphView',
    'lookGit.changesView',
];

const VIEW_COMMAND_SUFFIXES = [
    'focus',
    'resetViewLocation',
    'toggleVisibility',
    'removeView',
];

function isVsCodeGeneratedViewCommand(command: string): boolean {
    return VIEW_IDS.some((viewId) =>
        VIEW_COMMAND_SUFFIXES.some((suffix) => command === `${viewId}.${suffix}`)
    );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('Look Git extension runtime', () => {

    suiteSetup(async () => {
        const fixturePath = process.env.LOOK_GIT_INTEGRATION_REPO;
        assert.ok(fixturePath, 'Integration runner should provide LOOK_GIT_INTEGRATION_REPO.');
        fixtureRepo = { cwd: fixturePath! };
        await waitForBuiltInGitRepo(fixtureRepo.cwd);
        await activateExtension();
    });

    // -----------------------------------------------------------------------
    // Activation
    // -----------------------------------------------------------------------

    suite('activation', () => {
        test('activates and registers its user-facing commands', async () => {
            const extension = await activateExtension();
            assert.ok(extension, 'Extension should be discoverable by publisher/name id.');
            assert.equal(extension.isActive, true);

            const commands = await vscode.commands.getCommands(true);
            for (const command of [
                'lookGit.refreshHistory',
                'lookGit.refreshChanges',
                'lookGit.openGraph',
                'lookGit.cherryPick',
                'lookGit.renameCommit',
                'lookGit.stageAll',
                'lookGit.discardAll',
            ]) {
                assert.ok(commands.includes(command), `Expected command to be registered: ${command}`);
            }
        });

        test('is still active after a second call to activate()', async () => {
            const extension = vscode.extensions.getExtension('mathias8dev.look-git')!;
            await extension.activate();
            assert.equal(extension.isActive, true);
        });

        test('extension id matches the publisher.name convention', () => {
            const extension = vscode.extensions.getExtension('mathias8dev.look-git')!;
            assert.equal(extension.id, 'mathias8dev.look-git');
        });

        test('package.json is accessible via extension.packageJSON', () => {
            const extension = vscode.extensions.getExtension('mathias8dev.look-git')!;
            const pkg = extension.packageJSON as Record<string, unknown>;
            assert.equal(pkg['name'], 'look-git');
            assert.equal(pkg['publisher'], 'mathias8dev');
        });

        test('declares Git Graph in a bottom panel view container by default', () => {
            const extension = vscode.extensions.getExtension('mathias8dev.look-git')!;
            const pkg = extension.packageJSON as {
                contributes?: {
                    viewsContainers?: { panel?: Array<{ id?: string; title?: string }> };
                    views?: Record<string, Array<{ id?: string; type?: string }>>;
                };
            };

            assert.ok(
                pkg.contributes?.viewsContainers?.panel?.some((container) => container.id === 'look-git-graph'),
                'Expected Git Graph to contribute a panel container.',
            );
            assert.ok(
                pkg.contributes?.views?.['look-git-graph']?.some((view) =>
                    view.id === 'lookGit.graphView' && view.type === 'webview'
                ),
                'Expected lookGit.graphView to live in the Git Graph panel container.',
            );
        });

        test('opens with a real Git repository discovered by VS Code Git API', async () => {
            assert.ok(fixtureRepo, 'Fixture repository should exist.');
            await waitForBuiltInGitRepo(fixtureRepo!.cwd);
        });

        test('fixture repository has multiple commits, contributors, and branches', () => {
            assert.ok(fixtureRepo, 'Fixture repository should exist.');

            const commitCount = Number(git(fixtureRepo!.cwd, ['rev-list', '--count', '--all']));
            const contributors = new Set(
                git(fixtureRepo!.cwd, ['log', '--all', '--format=%an <%ae>'])
                    .split('\n')
                    .filter(Boolean),
            );
            const branches = git(fixtureRepo!.cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
                .split('\n')
                .filter(Boolean);

            assert.ok(commitCount >= 100, `Expected at least 100 commits, got ${commitCount}.`);
            assert.ok(contributors.size >= 10, `Expected at least 10 contributors, got ${contributors.size}.`);
            assert.ok(branches.length >= 8, `Expected at least 8 local branches, got ${branches.length}.`);
            for (const branch of ['main', 'feature/api', 'feature/ui', 'bugfix/status', 'experiment/graph']) {
                assert.ok(branches.includes(branch), `Expected fixture branch to exist: ${branch}`);
            }
        });
    });

    // -----------------------------------------------------------------------
    // Command registration — every command declared in package.json
    // -----------------------------------------------------------------------

    suite('command registration', () => {
        let registeredCommands: string[];

        suiteSetup(async () => {
            registeredCommands = await vscode.commands.getCommands(true);
        });

        test('registers every lookGit command declared in package.json', () => {
            const contributed = getContributedLookGitCommands();
            assert.ok(contributed.length > 0, 'package.json should declare lookGit commands.');

            for (const command of contributed) {
                assert.ok(
                    registeredCommands.includes(command),
                    `Command not registered: ${command}`,
                );
            }
        });

        test('no unexpected lookGit commands are registered', () => {
            const contributed = getContributedLookGitCommands();
            const extra = registeredCommands
                .filter((c) => c.startsWith('lookGit.'))
                .filter((c) => !contributed.includes(c))
                .filter((c) => !isVsCodeGeneratedViewCommand(c));
            assert.deepStrictEqual(extra, [], `Unexpected commands registered: ${extra.join(', ')}`);
        });
    });

    // -----------------------------------------------------------------------
    // lookgit-empty content provider
    // -----------------------------------------------------------------------

    suite('lookgit-empty content provider', () => {
        test('serves empty content for added/deleted diff placeholders', async () => {
            const doc = await openEmpty('placeholder.txt');
            assert.equal(doc.getText(), '');
        });

        test('serves empty content for a TypeScript source file path', async () => {
            const doc = await openEmpty('src/commands/index.ts');
            assert.equal(doc.getText(), '');
        });

        test('serves empty content for a path with spaces', async () => {
            const doc = await openEmpty('my%20file%20name.ts');
            assert.equal(doc.getText(), '');
        });

        test('serves empty content for a deeply nested path', async () => {
            const doc = await openEmpty('a/b/c/d/e/deep.ts');
            assert.equal(doc.getText(), '');
        });

        test('serves empty content for a file with no extension', async () => {
            const doc = await openEmpty('Makefile');
            assert.equal(doc.getText(), '');
        });

        test('serves empty content for a hidden dot-file path', async () => {
            const doc = await openEmpty('.gitignore');
            assert.equal(doc.getText(), '');
        });

        test('two different URIs both return empty content', async () => {
            const [a, b] = await Promise.all([
                openEmpty('file-a.ts'),
                openEmpty('file-b.ts'),
            ]);
            assert.equal(a.getText(), '');
            assert.equal(b.getText(), '');
        });

        test('document keeps the file extension language association', async () => {
            const doc = await openEmpty('anything.ts');
            assert.equal(doc.languageId, 'typescript');
        });

        test('document is not dirty after opening', async () => {
            const doc = await openEmpty('clean.ts');
            assert.equal(doc.isDirty, false);
        });

        test('document URI has the lookgit-empty scheme', async () => {
            const doc = await openEmpty('scheme-check.ts');
            assert.equal(doc.uri.scheme, 'lookgit-empty');
        });
    });

    // -----------------------------------------------------------------------
    // Configuration defaults
    // -----------------------------------------------------------------------

    suite('configuration defaults', () => {
        test('lookGit config section is accessible', () => {
            const config = vscode.workspace.getConfiguration('lookGit');
            assert.ok(config, 'lookGit config section should exist');
        });

        test('lookGit.maxCommits defaults to 50', () => {
            const config = vscode.workspace.getConfiguration('lookGit');
            assert.strictEqual(config.get<number>('maxCommits'), 50);
        });

        test('lookGit.confirmDangerousOperations defaults to true', () => {
            const config = vscode.workspace.getConfiguration('lookGit');
            assert.strictEqual(config.get<boolean>('confirmDangerousOperations'), true);
        });

        test('lookGit.maxCommits is a positive integer', () => {
            const config = vscode.workspace.getConfiguration('lookGit');
            const value = config.get<number>('maxCommits')!;
            assert.ok(Number.isInteger(value) && value > 0, `Expected positive integer, got ${value}`);
        });
    });

    // -----------------------------------------------------------------------
    // View mode toggle commands (pure state, no git repo required)
    // -----------------------------------------------------------------------

    suite('view mode toggle commands', () => {
        const TOGGLE_COMMANDS = [
            'lookGit.historyViewAsTree',
            'lookGit.historyViewAsTreeActive',
            'lookGit.historyViewAsList',
            'lookGit.historyViewAsListActive',
            'lookGit.viewAsTree',
            'lookGit.viewAsTreeActive',
            'lookGit.viewAsList',
            'lookGit.viewAsListActive',
        ];

        for (const command of TOGGLE_COMMANDS) {
            test(`${command} executes without throwing`, async () => {
                await vscode.commands.executeCommand(command);
                // No assertion needed — reaching this line means no unhandled error
            });
        }

        test('toggling history view between tree and list does not throw', async () => {
            await vscode.commands.executeCommand('lookGit.historyViewAsTree');
            await vscode.commands.executeCommand('lookGit.historyViewAsList');
            await vscode.commands.executeCommand('lookGit.historyViewAsTree');
        });

        test('toggling changes view between tree and list does not throw', async () => {
            await vscode.commands.executeCommand('lookGit.viewAsTree');
            await vscode.commands.executeCommand('lookGit.viewAsList');
            await vscode.commands.executeCommand('lookGit.viewAsTree');
        });
    });

    // -----------------------------------------------------------------------
    // Refresh commands (fire-and-forget events, no git repo required)
    // -----------------------------------------------------------------------

    suite('refresh commands', () => {
        test('lookGit.refreshHistory executes without throwing', async () => {
            await vscode.commands.executeCommand('lookGit.refreshHistory');
        });

        test('lookGit.refreshChanges executes without throwing', async () => {
            await vscode.commands.executeCommand('lookGit.refreshChanges');
        });

        test('calling refreshHistory twice in a row does not throw', async () => {
            await vscode.commands.executeCommand('lookGit.refreshHistory');
            await vscode.commands.executeCommand('lookGit.refreshHistory');
        });

        test('calling refreshChanges twice in a row does not throw', async () => {
            await vscode.commands.executeCommand('lookGit.refreshChanges');
            await vscode.commands.executeCommand('lookGit.refreshChanges');
        });
    });

    // -----------------------------------------------------------------------
    // openGraph command
    // -----------------------------------------------------------------------

    suite('lookGit.openGraph', () => {
        test('executes without throwing', async () => {
            await vscode.commands.executeCommand('lookGit.openGraph');
        });
    });
});
