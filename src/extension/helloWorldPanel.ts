import * as vscode from 'vscode';
import { bindHelloWorldMessages, configureHelloWorldWebview } from './helloWorldWebview';

type HelloWorldPanelOptions = {
    readonly extensionUri: vscode.Uri;
    readonly greeting: string;
};

export type HelloWorldPanelResult = {
    readonly title: string;
    readonly viewType: string;
};

export function openHelloWorldPanel(options: HelloWorldPanelOptions): HelloWorldPanelResult {
    const panel = vscode.window.createWebviewPanel(
        'lookGit.helloWorld',
        'Look Git',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(options.extensionUri, 'dist', 'webview'),
            ],
        },
    );

    configureHelloWorldWebview(panel.webview, options.extensionUri);
    const messageSubscription = bindHelloWorldMessages(panel.webview, options.greeting);
    panel.onDidDispose(() => messageSubscription.dispose());

    return {
        title: panel.title,
        viewType: panel.viewType,
    };
}
