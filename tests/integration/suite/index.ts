import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { runTestCases } from '../../helpers/testRunner';

export function run(): Promise<void> {
    return runTestCases('Look Git integration', [
        {
            name: 'activates the extension and contributes commands and views',
            run: async () => {
                const extension = vscode.extensions.getExtension('mathias8dev.look-git');
                assert.ok(extension, 'Expected the Look Git extension to be installed in the test host.');

                await extension.activate();
                assert.equal(extension.isActive, true);

                const commands = await vscode.commands.getCommands(true);
                assert.ok(
                    commands.includes('workbench.view.extension.look-git'),
                    'Expected the Look Git Activity Bar container command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.changesView.focus'),
                    'Expected the Changes view focus command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.commitHistory.focus'),
                    'Expected the Commit History view focus command to be registered.',
                );
                assert.ok(
                    commands.includes('lookGit.graphView.focus'),
                    'Expected the Git Graph view focus command to be registered.',
                );
            },
        },
    ]);
}
