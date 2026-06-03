import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { webviewFontSizeStyle } from './webview-font';

const WEBVIEW_CONTEXT = JSON.stringify({ preventDefaultContextMenuItems: true });

export function getWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    scriptName: 'changes' | 'graph' | 'history',
): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', `${scriptName}.js`),
    );
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'styles.css'),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}';" />
  <style nonce="${nonce}">${webviewFontSizeStyle()}</style>
  <link rel="stylesheet" href="${styleUri}" />
  <title>Look Git</title>
</head>
<body data-vscode-context='${WEBVIEW_CONTEXT}'>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}
