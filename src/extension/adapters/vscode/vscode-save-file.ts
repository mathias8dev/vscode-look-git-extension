import * as path from 'path';
import * as vscode from 'vscode';
import type { SaveFileOptions, SaveFilePort } from '@application/ports/save-file';

export class VscodeSaveFile implements SaveFilePort {
    async showSaveFile(options: SaveFileOptions): Promise<string | undefined> {
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(options.defaultDirectory, options.defaultFileName)),
            filters: Object.fromEntries(Object.entries(options.filters ?? {}).map(([label, extensions]) => [label, [...extensions]])),
        });
        return uri?.fsPath;
    }
}
