import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { getConfiguredWebviewFontSize, webviewFontSizeStyle } from './webview-font';

const WEBVIEW_CONTEXT = JSON.stringify({ preventDefaultContextMenuItems: true });

export function getWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    scriptName: 'changes' | 'commitMessage' | 'fileHistory' | 'graph' | 'history',
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
  <script nonce="${nonce}">${webviewFontSizeBootstrapScript(getConfiguredWebviewFontSize())}</script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
}

function webviewFontSizeBootstrapScript(initialFontSize: number): string {
    return `(() => {
  const applyElementFontSize = (element, value) => {
    if (element) { element.style.fontSize = value; }
  };
  const applyFontSize = (fontSize) => {
    if (typeof fontSize !== 'number' || !Number.isFinite(fontSize) || fontSize <= 0) { return; }
    const value = fontSize + 'px';
    document.documentElement.style.setProperty('--look-git-font-size', value);
    applyElementFontSize(document.documentElement, value);
    applyElementFontSize(document.body, value);
    applyElementFontSize(document.getElementById('root'), value);
    window.dispatchEvent(new CustomEvent('lookGitFontSizeChanged'));
  };
  applyFontSize(${initialFontSize});
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'ui/fontSizeChanged') { applyFontSize(event.data.fontSize); }
  });
})();`;
}
