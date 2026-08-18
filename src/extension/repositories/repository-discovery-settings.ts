import * as vscode from 'vscode';
import { DEFAULT_REPOSITORY_SCAN_MAX_DEPTH, normalizeRepositoryScanMaxDepth } from '@extension/repositories/repository-scan-depth';

const CONFIGURATION_SECTION = 'lookGit';
const REPOSITORY_SCAN_MAX_DEPTH_KEY = 'repositoryScanMaxDepth';
const REPOSITORY_SCAN_MAX_DEPTH_SECTION = `${CONFIGURATION_SECTION}.${REPOSITORY_SCAN_MAX_DEPTH_KEY}`;

export function getRepositoryScanMaxDepth(resource: vscode.Uri): number {
    const value = vscode.workspace
        .getConfiguration(CONFIGURATION_SECTION, resource)
        .get<unknown>(REPOSITORY_SCAN_MAX_DEPTH_KEY, DEFAULT_REPOSITORY_SCAN_MAX_DEPTH);
    return normalizeRepositoryScanMaxDepth(value);
}

export function registerRepositoryScanMaxDepthListener(onDidChange: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(REPOSITORY_SCAN_MAX_DEPTH_SECTION)) {
            onDidChange();
        }
    });
}
