import * as vscode from 'vscode';
import type { ProtocolError } from '@protocol/shared/base';

let channel: vscode.OutputChannel | undefined;

function getChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel('Look Git');
    }
    return channel;
}

export function appendErrorToOutput(error: ProtocolError, fallbackOperation: string): void {
    const output = getChannel();
    output.appendLine(`[${new Date().toISOString()}] ${error.operation ?? fallbackOperation} failed`);
    output.appendLine(error.message);
    if (error.details) {
        output.appendLine('');
        output.appendLine(error.details);
    }
    output.appendLine('');
}

export function showErrorOutput(): void {
    getChannel().show();
}

/** Test-only: drops the cached channel so each test starts from a clean slate. */
export function resetErrorOutputChannel(): void {
    channel = undefined;
}
