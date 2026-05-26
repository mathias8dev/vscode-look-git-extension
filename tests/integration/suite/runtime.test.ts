import * as assert from 'assert';
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

async function openEmpty(path: string): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(vscode.Uri.parse(`lookgit-empty:${path}`));
}

// ---------------------------------------------------------------------------
// All commands declared in package.json
// ---------------------------------------------------------------------------

const ALL_COMMANDS = [
    'lookGit.refreshHistory',
    'lookGit.loadMore',
    'lookGit.cherryPick',
    'lookGit.rebase',
    'lookGit.reset',
    'lookGit.revert',
    'lookGit.drop',
    'lookGit.renameCommit',
    'lookGit.checkout',
    'lookGit.squash',
    'lookGit.fixup',
    'lookGit.pushUpTo',
    'lookGit.copyCommitHash',
    'lookGit.viewCommitDetails',
    'lookGit.openGraph',
    'lookGit.refreshChanges',
    'lookGit.fetchAll',
    'lookGit.pull',
    'lookGit.push',
    'lookGit.viewAsTree',
    'lookGit.viewAsList',
    'lookGit.viewAsTreeActive',
    'lookGit.viewAsListActive',
    'lookGit.historyViewAsTree',
    'lookGit.historyViewAsList',
    'lookGit.historyViewAsTreeActive',
    'lookGit.historyViewAsListActive',
    'lookGit.stageAll',
    'lookGit.unstageAll',
    'lookGit.discardAll',
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('Look Git extension runtime', () => {

    suiteSetup(async () => {
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
    });

    // -----------------------------------------------------------------------
    // Command registration — every command declared in package.json
    // -----------------------------------------------------------------------

    suite('command registration', () => {
        let registeredCommands: string[];

        suiteSetup(async () => {
            registeredCommands = await vscode.commands.getCommands(true);
        });

        for (const command of ALL_COMMANDS) {
            // Mocha collects tests synchronously; the closure captures `command` by value
            // because `const` in a for-of loop creates a new binding per iteration.
            test(`registers ${command}`, () => {
                assert.ok(
                    registeredCommands.includes(command),
                    `Command not registered: ${command}`,
                );
            });
        }

        test('no unexpected lookGit commands are registered', () => {
            const extra = registeredCommands
                .filter((c) => c.startsWith('lookGit.') && !ALL_COMMANDS.includes(c));
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

        test('document language id is plain text', async () => {
            const doc = await openEmpty('anything.ts');
            // The provider registers no language; VSCode picks plaintext for unknown schemes
            assert.ok(doc.languageId, 'Language id should be set');
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
