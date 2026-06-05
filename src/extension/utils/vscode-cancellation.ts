import * as vscode from 'vscode';

export async function withCancellationSignal<T>(token: vscode.CancellationToken, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    if (token.isCancellationRequested) { controller.abort(); }
    const disposable = token.onCancellationRequested(() => controller.abort());
    try {
        return await task(controller.signal);
    } finally {
        disposable.dispose();
    }
}
