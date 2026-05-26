import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import { CommitItem } from '../commitItem';
import { GraphDataProvider } from './graphDataProvider';
import type { GitService } from '../gitService';
import { showModalWarningMessage } from '../utils/confirmation';

const ALLOWED_COMMIT_COMMANDS = new Set([
    'lookGit.cherryPick',
    'lookGit.revert',
    'lookGit.rebase',
    'lookGit.reset',
    'lookGit.checkout',
    'lookGit.drop',
    'lookGit.renameCommit',
    'lookGit.fixup',
    'lookGit.copyCommitHash',
]);

export class GraphViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'lookGit.graphView';

    private view?: vscode.WebviewView;
    private readonly dataProvider: GraphDataProvider;
    private readonly gitService: GitService;
    private readonly extensionUri: vscode.Uri;
    private readonly graphPageSize = 300;
    private filterBranches?: string[];
    private pathFilter?: string;
    private loadedGraphLimit = this.graphPageSize;
    private graphHasMore = true;
    private graphLoading = false;
    private graphRequestSequence = 0;
    private pendingRefresh = false;
    private refreshPromise?: Promise<void>;

    constructor(extensionUri: vscode.Uri, gitService: GitService) {
        this.extensionUri = extensionUri;
        this.gitService = gitService;
        this.dataProvider = new GraphDataProvider(gitService);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
            ],
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg),
        );

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.pendingRefresh) {
                this.refresh();
            }
        });

        this.refresh();
    }

    public async refresh(filterBranches?: string[], pathFilter?: string): Promise<void> {
        if (arguments.length > 0) {
            this.filterBranches = filterBranches;
            this.pathFilter = pathFilter;
            this.resetGraphPaging();
        }
        if (!this.view) { return; }
        this.pendingRefresh = true;

        if (!this.view.visible) {
            return;
        }

        if (this.refreshPromise) {
            await this.refreshPromise;
            return;
        }

        this.refreshPromise = this.drainRefreshQueue();
        try {
            await this.refreshPromise;
        } finally {
            this.refreshPromise = undefined;
        }
    }

    private async drainRefreshQueue(): Promise<void> {
        while (this.view?.visible && this.pendingRefresh) {
            this.pendingRefresh = false;
            await this.postGraphData();
        }
    }

    private async postGraphData(): Promise<boolean> {
        if (!this.view) { return false; }
        const requestSequence = ++this.graphRequestSequence;
        const loadedGraphLimit = this.loadedGraphLimit;
        const filterBranches = this.filterBranches;
        const pathFilter = this.pathFilter;
        try {
            const data = await this.dataProvider.getGraphData(loadedGraphLimit, filterBranches, pathFilter);
            if (requestSequence !== this.graphRequestSequence) {
                return false;
            }
            this.graphHasMore = data.hasMore;
            this.view.webview.postMessage({ type: 'graphData', data });
            return true;
        } catch (error) {
            if (requestSequence !== this.graphRequestSequence) {
                return false;
            }
            const message = error instanceof Error ? error.message : String(error);
            this.view.webview.postMessage({ type: 'error', message });
            return false;
        }
    }

    public reveal(): void {
        if (this.view) {
            this.view.show?.(true);
        }
    }

    private async handleMessage(msg: { type: string; [key: string]: unknown }): Promise<void> {
        switch (msg.type) {
            case 'ready':
                this.resetGraphPaging();
                this.refresh();
                break;

            case 'selectBranch': {
                const branches = msg.branches as string[] | undefined;
                const pathFilter = msg.path as string | undefined;
                this.refresh(branches, pathFilter);
                break;
            }

            case 'loadMoreGraph':
                await this.loadMoreGraph();
                break;

            case 'getCommitDetails': {
                const hash = msg.hash as string;
                try {
                    const [files, fullMessage] = await Promise.all([
                        this.dataProvider.getCommitFiles(hash),
                        this.dataProvider.getCommitMessage(hash),
                    ]);
                    this.view?.webview.postMessage({
                        type: 'commitDetails',
                        hash,
                        files,
                        fullMessage,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    this.view?.webview.postMessage({ type: 'error', message });
                }
                break;
            }

            case 'openDiff': {
                const filePath = msg.filePath as string;
                const commitHash = msg.commitHash as string;
                const status = msg.status as string;
                const origPath = msg.origPath as string | undefined;
                const parentHash = msg.parentHash as string | undefined;
                this.openDiff(filePath, commitHash, status, origPath, parentHash);
                break;
            }

            case 'executeCommand': {
                const command = msg.command as string;
                const commitHash = msg.commitHash as string;
                if (!ALLOWED_COMMIT_COMMANDS.has(command)) {
                    vscode.window.showErrorMessage(`Command is not allowed from Look Git graph: ${command}`);
                    return;
                }
                const commit = await this.gitService.getCommit(commitHash);
                if (!commit) {
                    vscode.window.showErrorMessage(`Commit not found: ${commitHash}`);
                    return;
                }
                vscode.commands.executeCommand(command, new CommitItem(commit, false));
                break;
            }

            case 'executeBranchCommand': {
                const command = msg.command as string;
                const branch = msg.branch as string;
                const isRemote = msg.isRemote as boolean;
                await this.handleBranchCommand(command, branch, isRemote);
                break;
            }

            case 'refresh':
                this.resetGraphPaging();
                this.refresh(this.filterBranches, this.pathFilter);
                break;
        }
    }

    private async loadMoreGraph(): Promise<void> {
        if (!this.view || this.graphLoading || !this.graphHasMore) {
            return;
        }

        const previousLimit = this.loadedGraphLimit;
        this.graphLoading = true;
        this.loadedGraphLimit += this.graphPageSize;
        this.graphRequestSequence++;

        try {
            if (this.refreshPromise) {
                this.pendingRefresh = true;
                await this.refreshPromise;
                return;
            }
            const posted = await this.postGraphData();
            if (!posted && this.loadedGraphLimit === previousLimit + this.graphPageSize) {
                this.loadedGraphLimit = previousLimit;
            }
        } finally {
            this.graphLoading = false;
        }
    }

    private resetGraphPaging(): void {
        this.loadedGraphLimit = this.graphPageSize;
        this.graphHasMore = true;
        this.graphRequestSequence++;
    }

    private async handleBranchCommand(command: string, branch: string, isRemote: boolean): Promise<void> {
        try {
            switch (command) {
                case 'checkout':
                    await this.gitService.checkout(branch);
                    break;

                case 'newBranchFrom': {
                    const name = await vscode.window.showInputBox({
                        prompt: `New branch name (from ${branch})`,
                        placeHolder: 'my-new-branch',
                    });
                    if (!name) { return; }
                    await this.gitService.checkoutNewBranch(name, branch);
                    break;
                }

                case 'checkoutRebaseOnto': {
                    const currentBranch = await this.gitService.getCurrentBranch();
                    await this.gitService.checkout(branch);
                    await this.gitService.rebase(currentBranch);
                    break;
                }

                case 'delete': {
                    const confirmMsg = isRemote
                        ? `Delete remote branch "${branch}"? This cannot be undone.`
                        : `Delete local branch "${branch}"?`;
                    const choice = await showModalWarningMessage(confirmMsg, 'Delete');
                    if (choice !== 'Delete') { return; }

                    if (isRemote) {
                        const slashIdx = branch.indexOf('/');
                        const remote = branch.substring(0, slashIdx);
                        const branchName = branch.substring(slashIdx + 1);
                        await this.gitService.deleteRemoteBranch(remote, branchName);
                    } else {
                        await this.gitService.deleteBranch(branch);
                    }
                    break;
                }

                case 'rename': {
                    const newName = await vscode.window.showInputBox({
                        prompt: `Rename branch "${branch}" to:`,
                        value: branch,
                    });
                    if (!newName || newName === branch) { return; }
                    await this.gitService.renameBranch(branch, newName);
                    break;
                }

                case 'push': {
                    const remotes = await this.gitService.getRemotes();
                    let remote = remotes[0] ?? 'origin';
                    if (remotes.length > 1) {
                        const picked = await vscode.window.showQuickPick(remotes, {
                            placeHolder: 'Select remote to push to',
                        });
                        if (!picked) { return; }
                        remote = picked;
                    }
                    await this.gitService.pushBranch(remote, branch);
                    break;
                }

                case 'update': {
                    let remote: string;
                    let branchName: string;
                    if (isRemote) {
                        const slashIdx = branch.indexOf('/');
                        remote = slashIdx === -1 ? 'origin' : branch.substring(0, slashIdx);
                        branchName = slashIdx === -1 ? branch : branch.substring(slashIdx + 1);
                    } else {
                        const remotes = await this.gitService.getRemotes();
                        remote = remotes[0] ?? 'origin';
                        branchName = branch;
                    }
                    await this.gitService.fetchBranch(remote, branchName);
                    break;
                }

                case 'rebaseOnto':
                    await this.gitService.rebase(branch);
                    break;

                case 'mergeInto':
                    await this.gitService.merge(branch);
                    break;

                default:
                    return;
            }

            this.resetGraphPaging();
            this.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Branch operation failed: ${message}`);
            this.resetGraphPaging();
            this.refresh();
        }
    }

    private openDiff(filePath: string, commitHash: string, status: string, origPath?: string, parentHash?: string): void {
        const cwd = this.gitService.getWorkingDirectory();
        const fileUri = vscode.Uri.file(path.join(cwd, filePath));
        const originalFileUri = vscode.Uri.file(path.join(cwd, origPath ?? filePath));
        const emptyUri = vscode.Uri.parse(`lookgit-empty:${filePath}`);

        const toGitUri = (uri: vscode.Uri, ref: string): vscode.Uri => {
            const query = JSON.stringify({ path: uri.fsPath, ref });
            return uri.with({ scheme: 'git', path: uri.path, query });
        };

        let leftUri: vscode.Uri;
        let rightUri: vscode.Uri;

        if (status === 'A') {
            leftUri = emptyUri;
            rightUri = toGitUri(fileUri, commitHash);
        } else if (status === 'D') {
            leftUri = toGitUri(originalFileUri, parentHash ?? `${commitHash}~1`);
            rightUri = emptyUri;
        } else {
            leftUri = toGitUri(originalFileUri, parentHash ?? `${commitHash}~1`);
            rightUri = toGitUri(fileUri, commitHash);
        }

        const title = `${filePath} (${commitHash.substring(0, 7)})`;
        vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    }

    private getHtml(): string {
        const webview = this.view!.webview;
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'graph.js')
        );
        const nonce = getNonce();

        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <title>Git Graph</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

function getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
}
