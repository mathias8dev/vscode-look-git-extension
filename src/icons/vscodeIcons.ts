import * as vscode from 'vscode';

export const CODICON = {
    commit: 'git-commit',
    loadMore: 'ellipsis',
    loading: 'sync~spin',
} as const;

export function commitThemeIcon(isHead: boolean): vscode.ThemeIcon {
    return isHead
        ? new vscode.ThemeIcon(CODICON.commit, new vscode.ThemeColor('charts.green'))
        : new vscode.ThemeIcon(CODICON.commit);
}

export function fileThemeIcon(): vscode.ThemeIcon {
    return vscode.ThemeIcon.File;
}

export function folderThemeIcon(): vscode.ThemeIcon {
    return vscode.ThemeIcon.Folder;
}

export function loadMoreThemeIcon(isLoading: boolean): vscode.ThemeIcon {
    return new vscode.ThemeIcon(isLoading ? CODICON.loading : CODICON.loadMore);
}

export function commitQuickPickLabel(shortHash: string): string {
    return `$(${CODICON.commit}) ${shortHash}`;
}
