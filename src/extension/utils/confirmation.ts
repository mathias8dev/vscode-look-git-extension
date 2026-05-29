import * as vscode from 'vscode';

export async function showModalWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showWarningMessage(message, { modal: true }, ...items);
}

export async function showModalInformationMessage(message: string, ...items: string[]): Promise<string | undefined> {
    return vscode.window.showInformationMessage(message, { modal: true }, ...items);
}
