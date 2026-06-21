import type { GraphWebviewToExtensionMessage } from '@protocol/graph/messages';
import { vscodeApi } from '@webview/platform/vscode-host';
import { GraphApp } from '@webview/graph/graph-app';

export function GraphWebview() {
    return <GraphApp sendMessage={(message: GraphWebviewToExtensionMessage) => vscodeApi.postMessage(message)} />;
}
