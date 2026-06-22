import * as vscode from 'vscode';

const MOVE_EDITOR_TO_FLOATING_WINDOW_COMMAND = 'workbench.action.moveEditorToNewWindow';

export function movePanelToFloatingWindow(panel: vscode.WebviewPanel, failureMessage: string): void {
    void vscode.commands.executeCommand(MOVE_EDITOR_TO_FLOATING_WINDOW_COMMAND).then(undefined, () => {
        void vscode.window.showWarningMessage(failureMessage);
        panel.reveal(vscode.ViewColumn.Active);
    });
}
