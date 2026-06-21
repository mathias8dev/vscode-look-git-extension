import type { GraphWebviewToExtensionMessage } from '@protocol/graph/messages';
import { vscodeApi } from '@webview/platform/vscodeHost';
import { GraphApp } from '@webview/graph/GraphApp';

export function GraphWebview() {
    return <GraphApp sendMessage={(message: GraphWebviewToExtensionMessage) => vscodeApi.postMessage(message)} />;
}
