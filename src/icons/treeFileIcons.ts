import * as vscode from 'vscode';
import { getFileIconId } from './webviewIcons';

const FILE_ICON_RESOURCE_DIR = 'file-icons';

export function fileTreeIconUri(filePath: string, extensionUri: vscode.Uri): vscode.Uri {
    return vscode.Uri.joinPath(extensionUri, 'resources', FILE_ICON_RESOURCE_DIR, `${getFileIconId(filePath)}.svg`);
}

export function folderTreeIconUri(extensionUri: vscode.Uri, opened = false): vscode.Uri {
    return vscode.Uri.joinPath(extensionUri, 'resources', FILE_ICON_RESOURCE_DIR, opened ? 'folder-opened.svg' : 'folder.svg');
}
