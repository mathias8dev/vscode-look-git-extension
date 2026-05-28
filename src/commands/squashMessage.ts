import * as vscode from 'vscode';

export async function promptSquashMessage(defaultMessage: string): Promise<string | undefined> {
    const message = await vscode.window.showInputBox({
        prompt: 'Squash commit message',
        value: defaultMessage,
        placeHolder: 'Enter the final squash commit message',
        validateInput: (value) => value.trim() ? null : 'Commit message cannot be empty',
    });

    return message?.trim() || undefined;
}
