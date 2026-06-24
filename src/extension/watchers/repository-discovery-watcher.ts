import * as path from 'path';
import * as vscode from 'vscode';

const REPOSITORY_DISCOVERY_MARKER_PATTERNS = [
    '**/.git',
    '**/.git/config',
    '**/.git/commondir',
];

export class RepositoryDiscoveryWatcher implements vscode.Disposable {
    private readonly disposables: readonly vscode.Disposable[];

    constructor(
        private readonly onDidChange: () => void,
    ) {
        this.disposables = REPOSITORY_DISCOVERY_MARKER_PATTERNS.flatMap((pattern) => {
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);
            return [
                watcher,
                watcher.onDidCreate((uri) => this.handleMarkerChange(uri)),
                watcher.onDidDelete((uri) => this.handleMarkerChange(uri)),
            ];
        });
    }

    dispose(): void {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    private handleMarkerChange(uri: vscode.Uri): void {
        if (!isRepositoryDiscoveryMarkerPath(uri.fsPath)) { return; }
        this.onDidChange();
    }
}

export function isRepositoryDiscoveryMarkerPath(resourcePath: string): boolean {
    const segments = path.normalize(resourcePath).split(/[\\/]+/);
    const markerIndex = segments.lastIndexOf('.git');
    if (markerIndex === -1) { return false; }
    if (markerIndex === segments.length - 1) { return true; }
    if (markerIndex === segments.length - 2) {
        const markerFile = segments[markerIndex + 1];
        return markerFile === 'config' || markerFile === 'commondir';
    }
    return false;
}
