import * as vscode from 'vscode';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../protocol/messages';

export function configureHelloWorldWebview(webview: vscode.Webview, extensionUri: vscode.Uri): void {
    webview.options = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(extensionUri, 'dist', 'webview'),
        ],
    };

    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'style.css'),
    );

    webview.html = renderHelloWorldHtml({
        cspSource: webview.cspSource,
        nonce: createNonce(),
        scriptUri,
        styleUri,
    });
}

export function bindHelloWorldMessages(webview: vscode.Webview, greeting: string): vscode.Disposable {
    return webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
        if (message.type !== 'ready') { return; }

        const payload: ExtensionToWebviewMessage = {
            type: 'hello',
            message: greeting,
        };
        void webview.postMessage(payload);
    });
}

function renderHelloWorldHtml(options: {
    readonly cspSource: string;
    readonly nonce: string;
    readonly scriptUri: vscode.Uri;
    readonly styleUri: vscode.Uri;
}): string {
    const csp = [
        "default-src 'none'",
        `style-src ${options.cspSource}`,
        `script-src 'nonce-${options.nonce}'`,
    ].join('; ');

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <link rel="stylesheet" href="${options.styleUri}">
    <title>Look Git</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${options.nonce}" type="module" src="${options.scriptUri}"></script>
  </body>
</html>`;
}

function createNonce(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';

    for (let index = 0; index < 32; index += 1) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }

    return nonce;
}
