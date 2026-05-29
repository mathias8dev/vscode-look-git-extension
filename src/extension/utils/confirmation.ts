import * as vscode from 'vscode';

export async function showModalWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, { modal: true }, ...items);
}

export async function showModalInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, { modal: true }, ...items);
}

export async function confirmTypedPhrase(message: string, phrase: string): Promise<boolean> {
    const value = await vscode.window.showInputBox({
        prompt: `${message} Type "${phrase}" to confirm.`,
        placeHolder: phrase,
        ignoreFocusOut: true,
        validateInput(input) {
            return input === phrase ? undefined : `Type "${phrase}" to confirm.`;
        },
    });
    return value === phrase;
}
