// Singleton VS Code API — call once at module load, never again.
// All components import { vscodeApi } from here.

declare function acquireVsCodeApi(): {
    postMessage(msg: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

function createApi() {
    if (typeof acquireVsCodeApi === 'function') {
        return acquireVsCodeApi();
    }
    // Dev/test fallback
    return { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };
}

export const vscodeApi = createApi();
