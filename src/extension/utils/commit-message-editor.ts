import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { isAbortError } from '@core/shared/type-guards';
import { withCancellationSignal } from '@extension/utils/vscode-cancellation';
import { CommitMessageEditorMode } from '@extension/utils/commit-message-editor-mode';
import type { CommitMessageWebviewToExtensionMessage } from '@protocol/commit-message/messages';
import { getWebviewHtml } from '@extension/views/webview-html';
import { movePanelToFloatingWindow as moveWebviewPanelToFloatingWindow } from '@extension/utils/floating-editor-window';

const CONFIG_SECTION = 'lookGit';
const CONFIG_KEY = 'commitMessageEditor';
const DEFAULT_MODE = CommitMessageEditorMode.Window;

export interface CommitMessageEditorOptions {
    readonly generateMessage?: (signal: AbortSignal) => Promise<string>;
    readonly autoGenerate?: boolean;
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
    if (mode === CommitMessageEditorMode.Input) {
        if (options.autoGenerate && options.generateMessage) {
            return promptForGeneratedInput(currentMessage, options.generateMessage);
        }
        return Promise.resolve(vscode.window.showInputBox({ prompt: 'New commit message:', value: currentMessage }));
    }
    if (!extensionUri) {
        throw new Error('Commit message editor requires the extension URI.');
    }
    return openCommitMessagePanel(currentMessage, title, extensionUri, mode === CommitMessageEditorMode.Window, options);
}

async function promptForGeneratedInput(currentMessage: string, generate: (signal: AbortSignal) => Promise<string>): Promise<string | undefined> {
    let message = currentMessage;
    try {
        message = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating commit message', cancellable: true },
            (_progress, token) => withCancellationSignal(token, generate));
    } catch (error) {
        if (isAbortError(error)) { return undefined; }
        const details = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(`Could not generate a commit message: ${details} You can edit the draft manually.`);
    }
    return vscode.window.showInputBox({ prompt: 'New commit message:', value: message });
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
        let autoGenerationStarted = false;
        const startGeneration = (requestId: string): void => {
            if (!options.generateMessage) { return; }
            generateController?.abort();
            generateController = new AbortController();
            void generateMessage(panel, requestId, options.generateMessage, generateController.signal);
        };
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
                    if (options.autoGenerate && !autoGenerationStarted) {
                        autoGenerationStarted = true;
                        startGeneration(randomUUID());
                    }
                    return;
                case 'commitMessage/generate':
                    startGeneration(message.requestId);
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
    void moveWebviewPanelToFloatingWindow(panel, 'Could not open commit message editor in a separate window. Continuing in an editor tab.');
}
