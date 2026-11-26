import * as vscode from 'vscode';

interface ActionItem<T extends string> extends vscode.QuickPickItem {
    readonly value: T;
}

export async function pickAction<T extends string>(
    items: readonly ActionItem<T>[],
    placeHolder: string,
): Promise<T | undefined> {
    const selected = await vscode.window.showQuickPick(items, { placeHolder, matchOnDescription: true });
    return selected?.value;
}
