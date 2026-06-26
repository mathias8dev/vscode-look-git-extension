import * as vscode from 'vscode';
import type { CommitMessageWebviewToExtensionMessage } from '@protocol/commit-message/messages';
import { getWebviewHtml } from '@extension/views/webview-html';
import { movePanelToFloatingWindow as moveWebviewPanelToFloatingWindow } from '@extension/utils/floating-editor-window';

export type CommitMessageEditorMode = 'window' | 'editor' | 'input';

const CONFIG_SECTION = 'lookGit';
const CONFIG_KEY = 'commitMessageEditor';
const DEFAULT_MODE: CommitMessageEditorMode = 'window';

export interface CommitMessageEditorOptions {
    readonly generateMessage?: (signal: AbortSignal) => Promise<string>;
}

export function promptForCommitMessage(
    currentMessage: string,
    title: string,
    extensionUri?: vscode.Uri,
    options: CommitMessageEditorOptions = {},
): Promise<string | undefined> {
    const mode = vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .get<CommitMessageEditorMode>(CONFIG_KEY, DEFAULT_MODE);
    if (mode === 'input') {
        return Promise.resolve(vscode.window.showInputBox({ prompt: 'New commit message:', value: currentMessage }));
    }
    if (!extensionUri) {
        throw new Error('Commit message editor requires the extension URI.');
    }
    return openCommitMessagePanel(currentMessage, title, extensionUri, mode === 'window', options);
}

async function openCommitMessagePanel(
    currentMessage: string,
    title: string,
    extensionUri: vscode.Uri,
    floating: boolean,
    options: CommitMessageEditorOptions,
): Promise<string | undefined> {
    const panel = vscode.window.createWebviewPanel(
        'lookGit.commitMessageEditor',
        title,
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
        },
    );
    panel.webview.html = getWebviewHtml(panel.webview, extensionUri, 'commitMessage');

    return new Promise<string | undefined>((resolve) => {
        let settled = false;
        let generateController: AbortController | undefined;
        const finish = (message: string | undefined): void => {
            if (settled) { return; }
            settled = true;
            generateController?.abort();
            messageSubscription.dispose();
            disposeSubscription.dispose();
            panel.dispose();
            resolve(message?.trim() ? message.trim() : undefined);
        };
        const messageSubscription = panel.webview.onDidReceiveMessage((message: CommitMessageWebviewToExtensionMessage) => {
            switch (message.type) {
                case 'commitMessage/ready':
                    void panel.webview.postMessage({
                        type: 'commitMessage/init',
                        title,
                        message: currentMessage,
                        canGenerate: options.generateMessage !== undefined,
                    });
                    return;
                case 'commitMessage/generate':
                    if (!options.generateMessage) { return; }
                    generateController?.abort();
                    generateController = new AbortController();
                    void generateMessage(panel, message.requestId, options.generateMessage, generateController.signal);
                    return;
                case 'commitMessage/apply':
                    finish(message.message);
                    return;
                case 'commitMessage/cancel':
                    finish(undefined);
                    return;
            }
        });
        const disposeSubscription = panel.onDidDispose(() => { finish(undefined); });
        if (floating) {
            movePanelToFloatingWindow(panel);
        }
    });
}

async function generateMessage(
    panel: vscode.WebviewPanel,
    requestId: string,
    generate: (signal: AbortSignal) => Promise<string>,
    signal: AbortSignal,
): Promise<void> {
    await panel.webview.postMessage({ type: 'commitMessage/generating', requestId });
    try {
        const message = await generate(signal);
        if (signal.aborted) { return; }
        await panel.webview.postMessage({ type: 'commitMessage/generated', requestId, message });
    } catch (error) {
        if (signal.aborted) { return; }
        const message = error instanceof Error ? error.message : String(error);
        await panel.webview.postMessage({ type: 'commitMessage/generationError', requestId, message });
    }
}

function movePanelToFloatingWindow(panel: vscode.WebviewPanel): void {
    moveWebviewPanelToFloatingWindow(panel, 'Could not open commit message editor in a separate window. Continuing in an editor tab.');
}
