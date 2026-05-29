import type { WebviewToExtensionMessage } from '../../protocol/messages';

export type WebviewHost = {
    readonly postMessage: (message: WebviewToExtensionMessage) => void;
};

declare function acquireVsCodeApi(): WebviewHost;

export function createWebviewHost(): WebviewHost {
    if (typeof acquireVsCodeApi === 'function') {
        return acquireVsCodeApi();
    }

    return {
        postMessage: () => undefined,
    };
}
