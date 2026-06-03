import * as vscode from 'vscode';
import type { ClipboardPort } from '../../../application/ports/clipboard';

export class VscodeClipboard implements ClipboardPort {
    async writeText(text: string): Promise<void> {
        await vscode.env.clipboard.writeText(text);
    }
}
