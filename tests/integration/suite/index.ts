import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { createGreeting } from '../../../src/core/hello';
import { runTestCases } from '../../helpers/testRunner';

export function run(): Promise<void> {
    return runTestCases('Hello World integration', [
        {
            name: 'builds the greeting in pure core logic',
            run: () => {
                assert.equal(createGreeting('Look Git'), 'Hello from Look Git');
            },
        },
        {
            name: 'activates the extension and contributes commands and views',
            run: async () => {
                const extension = vscode.extensions.getExtension('mathias8dev.look-git');
                assert.ok(extension, 'Expected the Look Git extension to be installed in the test host.');

                await extension.activate();
                assert.equal(extension.isActive, true);

                const commands = await vscode.commands.getCommands(true);
                assert.ok(commands.includes('lookGit.helloWorld'), 'Expected lookGit.helloWorld to be registered.');
                assert.ok(
                    commands.includes('workbench.view.extension.look-git'),
                    'Expected the Look Git Activity Bar container command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.helloView.focus'),
                    'Expected the Look Git left-side Hello World view command to be registered.',
                );
            },
        },
    ]);
}
