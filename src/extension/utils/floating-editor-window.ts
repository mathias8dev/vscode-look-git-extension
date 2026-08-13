import * as vscode from 'vscode';

const MOVE_EDITOR_TO_FLOATING_WINDOW_COMMAND = 'workbench.action.moveEditorToNewWindow';
const CLOSE_WINDOW_COMMAND = 'workbench.action.closeWindow';

export function movePanelToFloatingWindow(panel: vscode.WebviewPanel, failureMessage: string): Thenable<boolean> {
    return vscode.commands.executeCommand(MOVE_EDITOR_TO_FLOATING_WINDOW_COMMAND).then(
        () => true,
        () => {
            void vscode.window.showWarningMessage(failureMessage);
            panel.reveal(vscode.ViewColumn.Active);
            return false;
        },
    );
}

export async function closePanelAndFloatingWindow(
    panel: vscode.WebviewPanel,
    movedToFloatingWindow: Thenable<boolean>,
): Promise<void> {
    const floating = await movedToFloatingWindow;
    if (!floating) {
        panel.dispose();
        return;
    }
    try {
        await vscode.commands.executeCommand(CLOSE_WINDOW_COMMAND);
    } finally {
        panel.dispose();
    }
}
