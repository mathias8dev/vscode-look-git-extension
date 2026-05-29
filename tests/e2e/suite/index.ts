import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { runTestCases } from '../../helpers/testRunner';

type HelloWorldPanelResult = {
    readonly title: string;
    readonly viewType: string;
};

export function run(): Promise<void> {
    return runTestCases('Hello World E2E', [
        {
            name: 'opens the React hello world panel from the command',
            run: async () => {
                const result = await vscode.commands.executeCommand<HelloWorldPanelResult>('lookGit.helloWorld');

                assert.deepEqual(result, {
                    title: 'Look Git',
                    viewType: 'lookGit.helloWorld',
                });
            },
        },
        {
            name: 'opens the Look Git Activity Bar view',
            run: async () => {
                await vscode.commands.executeCommand('workbench.view.extension.look-git');
                await vscode.commands.executeCommand('lookGit.helloView.focus');
            },
        },
    ]);
}
