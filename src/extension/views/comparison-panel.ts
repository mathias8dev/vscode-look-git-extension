import * as vscode from 'vscode';
import type { GitRepository } from '@application/ports/git-topology';
import type { ComparisonRequest } from '@protocol/comparison/messages';
import { ComparisonMessageRouter } from '@extension/messaging/comparison-message-router';
import { resolveGitMetadataRoots } from '@extension/watchers/repository-git-watcher';
import { getWebviewHtml } from '@extension/views/webview-html';
import { registerWebviewFontSizeSync, webviewFontSizeMessage } from '@extension/views/webview-font';
import { movePanelToFloatingWindow } from '@extension/utils/floating-editor-window';

export function openComparisonPanel(repository: GitRepository, extensionUri: vscode.Uri, baseBranch: string, headBranch: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel('lookGit.comparison', 'Branch Comparison', vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
    });
    const router = new ComparisonMessageRouter(repository, panel.webview, baseBranch, headBranch);
    const subscriptions: vscode.Disposable[] = [router, panel.webview.onDidReceiveMessage((message: ComparisonRequest) => { void router.handle(message); })];
    subscriptions.push(registerWebviewFontSizeSync([{ notifyFontSizeChanged: () => { void panel.webview.postMessage(webviewFontSizeMessage()); } }]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { void router.checkStale(); }, 300);
    };
    for (const root of resolveGitMetadataRoots(repository.cwd)) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(root), '**'));
        subscriptions.push(watcher, watcher.onDidChange(check), watcher.onDidCreate(check), watcher.onDidDelete(check));
    }
    subscriptions.push(panel.onDidChangeViewState(() => { if (panel.visible) { check(); } }));
    panel.onDidDispose(() => { clearTimeout(timer); for (const subscription of subscriptions) { subscription.dispose(); } });
    panel.webview.html = getWebviewHtml(panel.webview, extensionUri, 'comparison');
    void movePanelToFloatingWindow(panel, 'Could not open branch comparison in a separate window. Continuing in an editor tab.');
    return panel;
}
