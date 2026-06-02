import * as vscode from 'vscode';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { BranchCommand, CommitCommand, GraphWebviewToExtensionMessage, WorktreeCommand } from '../../protocol/graph/messages';
import type { GraphContextTarget } from '../../protocol/graph/types';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { GraphMessageRouter } from '../messaging/GraphMessageRouter';
import { getWebviewHtml } from './webviewHtml';

const GRAPH_COMMIT_COMMANDS: readonly { readonly id: string; readonly command: CommitCommand }[] = [
    { id: 'lookGit.graph.commit.copyRevisionNumber', command: 'copyRevisionNumber' },
    { id: 'lookGit.graph.commit.createPatch', command: 'createPatch' },
    { id: 'lookGit.graph.commit.cherryPick', command: 'cherryPick' },
    { id: 'lookGit.graph.commit.checkoutRevision', command: 'checkoutRevision' },
    { id: 'lookGit.graph.commit.showRepositoryAtRevision', command: 'showRepositoryAtRevision' },
    { id: 'lookGit.graph.commit.compareWithLocal', command: 'compareWithLocal' },
    { id: 'lookGit.graph.commit.newWorktreeFromCommit', command: 'newWorktreeFromCommit' },
    { id: 'lookGit.graph.commit.compareCommitWithWorktree', command: 'compareCommitWithWorktree' },
    { id: 'lookGit.graph.commit.resetCurrentBranchToHere', command: 'resetCurrentBranchToHere' },
    { id: 'lookGit.graph.commit.revertCommit', command: 'revertCommit' },
    { id: 'lookGit.graph.commit.undoCommit', command: 'undoCommit' },
    { id: 'lookGit.graph.commit.editCommitMessage', command: 'editCommitMessage' },
    { id: 'lookGit.graph.commit.fixup', command: 'fixup' },
    { id: 'lookGit.graph.commit.squashInto', command: 'squashInto' },
    { id: 'lookGit.graph.commit.dropCommit', command: 'dropCommit' },
    { id: 'lookGit.graph.commit.interactiveRebaseFromHere', command: 'interactiveRebaseFromHere' },
    { id: 'lookGit.graph.commit.pushAllUpToHere', command: 'pushAllUpToHere' },
    { id: 'lookGit.graph.commit.newBranch', command: 'newBranch' },
    { id: 'lookGit.graph.commit.newTag', command: 'newTag' },
];

const GRAPH_BRANCH_COMMANDS: readonly { readonly id: string; readonly command: BranchCommand }[] = [
    { id: 'lookGit.graph.branch.checkout', command: 'checkout' },
    { id: 'lookGit.graph.branch.newBranchFrom', command: 'newBranchFrom' },
    { id: 'lookGit.graph.branch.checkoutRebaseOnto', command: 'checkoutRebaseOnto' },
    { id: 'lookGit.graph.branch.newWorktreeFromBranch', command: 'newWorktreeFromBranch' },
    { id: 'lookGit.graph.branch.openBranchWorktree', command: 'openBranchWorktree' },
    { id: 'lookGit.graph.branch.revealBranchWorktree', command: 'revealBranchWorktree' },
    { id: 'lookGit.graph.branch.compareWithCurrent', command: 'compareWithCurrent' },
    { id: 'lookGit.graph.branch.showDiffWithWorkingTree', command: 'showDiffWithWorkingTree' },
    { id: 'lookGit.graph.branch.compareBranchWithWorktree', command: 'compareBranchWithWorktree' },
    { id: 'lookGit.graph.branch.showDiffWithBranchWorktree', command: 'showDiffWithBranchWorktree' },
    { id: 'lookGit.graph.branch.rebaseOnto', command: 'rebaseOnto' },
    { id: 'lookGit.graph.branch.mergeInto', command: 'mergeInto' },
    { id: 'lookGit.graph.branch.push', command: 'push' },
    { id: 'lookGit.graph.branch.pullBranchWorktree', command: 'pullBranchWorktree' },
    { id: 'lookGit.graph.branch.pushBranchWorktree', command: 'pushBranchWorktree' },
    { id: 'lookGit.graph.branch.lockBranchWorktree', command: 'lockBranchWorktree' },
    { id: 'lookGit.graph.branch.unlockBranchWorktree', command: 'unlockBranchWorktree' },
    { id: 'lookGit.graph.branch.removeBranchWorktree', command: 'removeBranchWorktree' },
    { id: 'lookGit.graph.branch.rename', command: 'rename' },
    { id: 'lookGit.graph.branch.delete', command: 'delete' },
];

const GRAPH_WORKTREE_COMMANDS: readonly { readonly id: string; readonly command: WorktreeCommand }[] = [
    { id: 'lookGit.graph.worktree.open', command: 'open' },
    { id: 'lookGit.graph.worktree.openInNewWindow', command: 'openInNewWindow' },
    { id: 'lookGit.graph.worktree.reveal', command: 'reveal' },
    { id: 'lookGit.graph.worktree.showDiffWithHead', command: 'showDiffWithHead' },
    { id: 'lookGit.graph.worktree.showDiffWithMainWorktree', command: 'showDiffWithMainWorktree' },
    { id: 'lookGit.graph.worktree.fetch', command: 'fetch' },
    { id: 'lookGit.graph.worktree.pull', command: 'pull' },
    { id: 'lookGit.graph.worktree.push', command: 'push' },
    { id: 'lookGit.graph.worktree.commit', command: 'commit' },
    { id: 'lookGit.graph.worktree.stash', command: 'stash' },
    { id: 'lookGit.graph.worktree.newBranch', command: 'newBranch' },
    { id: 'lookGit.graph.worktree.checkoutBranch', command: 'checkoutBranch' },
    { id: 'lookGit.graph.worktree.lock', command: 'lock' },
    { id: 'lookGit.graph.worktree.unlock', command: 'unlock' },
    { id: 'lookGit.graph.worktree.remove', command: 'remove' },
    { id: 'lookGit.graph.worktree.removeForce', command: 'removeForce' },
];

export class GraphViewProvider implements vscode.WebviewViewProvider {
    static readonly viewType = 'lookGit.graphView';

    private view?: vscode.WebviewView;
    private router?: GraphMessageRouter;
    private contextTarget?: GraphContextTarget;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly onRepositoryUpdated: () => Promise<void> = async () => {},
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
        };
        webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri, 'graph');

        this.router?.dispose();
        this.router = new GraphMessageRouter(this.repositories, (msg) => {
            webviewView.webview.postMessage(msg);
        }, this.onRepositoryUpdated);

        webviewView.webview.onDidReceiveMessage((msg: GraphWebviewToExtensionMessage) => {
            if (msg.type === 'graph/contextTarget') {
                this.contextTarget = msg.target;
                return;
            }
            void this.router!.handle(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) { this.router?.requestGraphRefresh(); }
        });
    }

    dispose(): void {
        this.router?.dispose();
    }

    registerNativeContextCommands(): readonly vscode.Disposable[] {
        return [
            ...GRAPH_COMMIT_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runCommitContextCommand(command))),
            ...GRAPH_BRANCH_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runBranchContextCommand(command))),
            ...GRAPH_WORKTREE_COMMANDS.map(({ id, command }) => vscode.commands.registerCommand(id, () => this.runWorktreeContextCommand(command))),
            vscode.commands.registerCommand('lookGit.graph.commit.goToChildCommit', () => this.selectContextCommit('child')),
            vscode.commands.registerCommand('lookGit.graph.commit.goToParentCommit', () => this.selectContextCommit('parent')),
            vscode.commands.registerCommand('lookGit.graph.worktree.showDetails', () => this.selectContextWorktree()),
        ];
    }

    /** Called by RepoRegistry when the active repo changes. */
    async notifyRepoChanged(context: SerializedRepoContext): Promise<void> {
        this.view?.webview.postMessage({ type: 'repo/contextChanged', context });
    }

    async refresh(): Promise<void> {
        this.router?.requestGraphRefresh();
    }

    private async runCommitContextCommand(command: CommitCommand): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'commit') { return; }
        await this.router?.handle({ type: 'graph/commitCommand', command, hash: target.hash, hashes: target.hashes });
    }

    private async runBranchContextCommand(command: BranchCommand): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'branch') { return; }
        await this.router?.handle({ type: 'graph/branchCommand', command, branch: target.branch, isRemote: target.isRemote });
    }

    private async runWorktreeContextCommand(command: WorktreeCommand): Promise<void> {
        const target = this.contextTarget;
        if (target?.kind !== 'worktree') { return; }
        await this.router?.handle({ type: 'graph/worktreeCommand', command, path: target.path });
    }

    private selectContextCommit(direction: 'child' | 'parent'): void {
        const target = this.contextTarget;
        if (target?.kind !== 'commit') { return; }
        const hash = direction === 'child' ? target.childHash : target.parentHash;
        if (hash) { void this.view?.webview.postMessage({ type: 'graph/selectCommit', hash }); }
    }

    private selectContextWorktree(): void {
        const target = this.contextTarget;
        if (target?.kind === 'worktree') {
            void this.view?.webview.postMessage({ type: 'graph/selectWorktree', path: target.path });
        }
    }
}
