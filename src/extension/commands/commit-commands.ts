import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { GitRepository } from '../../application/ports/git-repository';
import type {
    GitHistoryOperations,
    GitReferenceOperations,
    GitStatusOperations,
    GitWorktreeTopologyOperations,
} from '../../application/ports/git-capabilities';
import type { CommitCommand } from '../../protocol/graph/messages';
import type { CommitReferenceActions } from '../../application/usecases/commits/commit-reference-actions';
import { defaultCommitReferenceActions } from '../adapters/vscode/default-commit-reference-actions';
import { CreateCommitPatchResultKind, type CreateCommitPatchUseCase, type CreateCommitPatchResult } from '../../application/usecases/commits/create-commit-patch';
import { defaultCreateCommitPatch } from '../adapters/vscode/default-create-commit-patch';
import { type ExplainCommitDiffUseCase } from '../../application/usecases/commits/explain-commit-diff';
import { defaultExplainCommitDiff } from '../adapters/vscode/default-explain-commit-diff';
import { GenerateRewordCommitMessageUseCase } from '../../application/usecases/commits/generate-reword-commit-message';
import { orderSelectedCommits } from '../../application/usecases/commits/order-selected-commits';
import { getReachableCommitHashes } from '../../application/usecases/commits/get-reachable-commit-hashes';
import { VscodeLanguageModelRewordCommitMessageGenerator } from '../adapters/vscode/vscode-language-model-reword-commit-message-generator';
import { showModalWarningMessage } from '../utils/confirmation';
import { openDiffExplanationDocument, showDiffExplanationError } from '../utils/diff-explanation-document';
import { isAbortError } from '../messaging/errorSerialization';
import { withCancellationSignal } from '../utils/vscode-cancellation';
import { showBranchNameInput } from '../utils/branch-name-input';
import { compareRefWithPickedWorktree, openChangesWithWorkingTree, promptNewWorktreePath } from './git-command-helpers';
import { promptForCommitMessage } from '../utils/commit-message-editor';
import { openVisualRebasePanel } from '../utils/visual-rebase-panel';
import { requireRuntimeRepository, requireRuntimeTargets, requireRuntimeWorktree, type RuntimeCommandTargets } from './runtime-command-targets';

export interface CommitCommandDiffExplanationScope {
    readonly label: string;
    readonly value: string;
}

const defaultGenerateRewordCommitMessage = new GenerateRewordCommitMessageUseCase(new VscodeLanguageModelRewordCommitMessageGenerator());

type CommitDiffReader = Pick<GitHistoryOperations, 'orderCommits' | 'getCommitPatch' | 'getCommitMessage'>;
type CommitReachabilityReader = Pick<GitHistoryOperations, 'getReachableCommitHashes'>;
type CommitSquashReader = Pick<GitHistoryOperations, 'getCommitDetails' | 'getCommitMessage'>;
type CommitStatusReader = Pick<GitStatusOperations, 'getStatus'>;
type CommitReferenceReader = Pick<GitReferenceOperations, 'listBranches' | 'listRemotes'>;
type CommitWorktreeCreator = Pick<GitWorktreeTopologyOperations, 'addDetachedWorktree'>;

export async function runCommitCommand(
    repo: GitRepository,
    command: CommitCommand,
    hash: string,
    hashes: readonly string[],
    commitReferenceActions: CommitReferenceActions = defaultCommitReferenceActions,
    createCommitPatch: CreateCommitPatchUseCase = defaultCreateCommitPatch,
    explainCommitDiffUseCase: ExplainCommitDiffUseCase = defaultExplainCommitDiff,
    diffExplanationScope?: CommitCommandDiffExplanationScope,
    extensionUri?: vscode.Uri,
    storageUri?: vscode.Uri,
    generateRewordCommitMessage: GenerateRewordCommitMessageUseCase = defaultGenerateRewordCommitMessage,
    runtimeTargets: RuntimeCommandTargets = {},
): Promise<boolean> {
    const selected = normalizeSelectedHashes(hash, hashes);
    switch (command) {
        case 'copyRevisionNumber':
            await commitReferenceActions.copyRevisionNumber(hash);
            return false;
        case 'createPatch':
            await showCommitPatchNotification(await createCommitPatch.execute(requireRuntimeRepository(runtimeTargets), selected));
            return false;
        case 'explainDiff':
            await explainCommitDiff(requireRuntimeRepository(runtimeTargets), selected, explainCommitDiffUseCase, diffExplanationScope);
            return false;
        case 'cherryPick': {
            const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
            await assertRuntimeNoUnmergedFiles(worktree, 'cherry-picking commits');
            await assertCherryPickableCommits(repository, selected);
            for (const commitHash of await orderSelectedCommits(repository, selected, 'oldestFirst')) {
                await worktree.cherryPick(commitHash, {});
            }
            return true;
        }
        case 'checkoutRevision':
            await requireRuntimeWorktree(runtimeTargets).checkout(hash, { detach: true });
            return true;
        case 'showRepositoryAtRevision':
            await showRepositoryAtRevision(hash, requireRuntimeRepository(runtimeTargets));
            return false;
        case 'compareWithLocal':
            await openChangesWithWorkingTree(repo, repo.cwd, hash, `Diff ${hash.substring(0, 7)}..local`);
            return false;
        case 'resetCurrentBranchToHere':
            await resetCurrentBranchToHere(repo, hash, runtimeTargets);
            return true;
        case 'revertCommit': {
            const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
            await assertRuntimeNoUnmergedFiles(worktree, 'reverting commits');
            for (const commitHash of await orderSelectedCommits(repository, selected, 'newestFirst')) {
                await worktree.revertCommit(commitHash, { noEdit: true });
            }
            return true;
        }
        case 'undoCommit':
            await undoHeadCommit(repo, hash, runtimeTargets);
            return true;
        case 'editCommitMessage':
            await editCommitMessage(hash, extensionUri, generateRewordCommitMessage, runtimeTargets);
            return true;
        case 'fixup':
            await fixupStagedChanges(hash, runtimeTargets);
            return true;
        case 'squashInto':
            await squashSelectedCommits(selected, runtimeTargets);
            return true;
        case 'dropCommit':
            await dropCommits(await orderSelectedCommits(requireRuntimeRepository(runtimeTargets), selected, 'newestFirst'), runtimeTargets);
            return true;
        case 'interactiveRebaseFromHere':
            if (!extensionUri) { throw new Error('Visual Rebase requires the extension URI.'); }
            if (!storageUri) { throw new Error('Visual Rebase requires extension storage.'); }
            await openVisualRebasePanel(repo, extensionUri, storageUri, {
                upstream: hash,
                onto: hash,
                title: `Visual Rebase from ${hash.substring(0, 7)}`,
            });
            return false;
        case 'pushAllUpToHere':
            await pushAllUpToHere(hash, runtimeTargets);
            return true;
        case 'newBranch':
            return commitReferenceActions.createBranchAtCommit(requireRuntimeRepository(runtimeTargets), hash);
        case 'newTag':
            return commitReferenceActions.createTagAtCommit(requireRuntimeRepository(runtimeTargets), hash);
        case 'newWorktreeFromCommit':
            return createWorktreeFromCommit(repo, hash, runtimeTargets);
        case 'compareCommitWithWorktree':
            await compareRefWithPickedWorktree(repo, hash, `Diff ${hash.substring(0, 7)}`);
            return false;
    }
}

async function explainCommitDiff(
    repo: CommitDiffReader,
    hashes: readonly string[],
    useCase: ExplainCommitDiffUseCase,
    scope: CommitCommandDiffExplanationScope | undefined,
): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Explaining commit diff...',
            cancellable: true,
        }, async (_progress, token) => withCancellationSignal(token, async (signal) => {
            const result = await useCase.execute(repo, hashes, signal);
            await openDiffExplanationDocument({
                title: 'Commit Diff Explanation',
                scope: scope?.value,
                scopeLabel: scope?.label,
                itemsTitle: 'Commits',
                items: result.selectedCommits,
                explanation: result.explanation,
                diffTruncated: result.diffTruncated,
            });
        }));
    } catch (error) {
        if (isAbortError(error)) { return; }
        await showDiffExplanationError(error);
    }
}

async function assertCherryPickableCommits(repo: CommitReachabilityReader, hashes: readonly string[]): Promise<void> {
    const reachable = await getReachableCommitHashes(repo, hashes).catch(() => new Set<string>());
    const alreadyInCurrentHistory = hashes
        .filter((hash) => reachable.has(hash))
        .map((hash) => hash.substring(0, 7));
    if (alreadyInCurrentHistory.length > 0) {
        throw new Error(`Cherry-pick is only available for commits outside the current branch history: ${alreadyInCurrentHistory.join(', ')}.`);
    }
}

async function showCommitPatchNotification(result: CreateCommitPatchResult): Promise<void> {
    switch (result.kind) {
        case CreateCommitPatchResultKind.Cancelled:
            return;
        case CreateCommitPatchResultKind.CopiedToClipboard:
            void vscode.window.showInformationMessage('Patch copied to clipboard.');
            return;
        case CreateCommitPatchResultKind.SavedToFile:
            void vscode.window.showInformationMessage(`Patch saved to ${result.filePath ?? 'file'}.`);
            return;
    }
}

function normalizeSelectedHashes(hash: string, hashes: readonly string[]): string[] {
    const selected = hashes.length > 0 ? hashes : [hash];
    return Array.from(new Set(selected.includes(hash) ? selected : [hash, ...selected]));
}

async function showRepositoryAtRevision(
    hash: string,
    repo: CommitWorktreeCreator,
): Promise<void> {
    const parentPath = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-revision-'));
    const worktreePath = path.join(parentPath, hash.substring(0, 7));
    await repo.addDetachedWorktree(worktreePath, hash);
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(worktreePath), { forceNewWindow: true });
}

async function createWorktreeFromCommit(repo: GitRepository, hash: string, runtimeTargets: RuntimeCommandTargets): Promise<boolean> {
    const worktreePath = await promptNewWorktreePath(repo, `Worktree path for ${hash.substring(0, 7)}:`);
    if (!worktreePath) { return false; }
    const branchName = await showBranchNameInput({
        prompt: `New branch name from ${hash.substring(0, 7)}:`,
    });
    if (!branchName) { return false; }
    await requireRuntimeRepository(runtimeTargets).addWorktree({ path: worktreePath, branch: branchName, createNew: true, startPoint: hash });
    return true;
}

async function resetCurrentBranchToHere(_repo: GitRepository, hash: string, runtimeTargets: RuntimeCommandTargets): Promise<void> {
    const mode = await vscode.window.showQuickPick(['Soft reset', 'Mixed reset', 'Hard reset', 'Keep reset'], { placeHolder: 'Reset current branch to selected revision' });
    if (!mode) { return; }
    if (mode === 'Hard reset') {
        const choice = await showModalWarningMessage('Hard reset current branch and discard working tree changes?', 'Hard Reset');
        if (choice !== 'Hard Reset') { return; }
    }
    const worktree = requireRuntimeWorktree(runtimeTargets);
    if (mode === 'Soft reset') { await worktree.resetSoft(hash); }
    else if (mode === 'Hard reset') { await worktree.resetHard(hash); }
    else if (mode === 'Keep reset') { await worktree.resetKeep(hash); }
    else { await worktree.resetMixed(hash); }
}

async function undoHeadCommit(_repo: GitRepository, hash: string, runtimeTargets: RuntimeCommandTargets): Promise<void> {
    const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
    const head = await repository.resolveRef('HEAD');
    if (head !== hash) { throw new Error('Only the current HEAD commit can be undone.'); }
    const choice = await showModalWarningMessage('Undo the current HEAD commit and keep its changes staged?', 'Undo Commit');
    if (choice !== 'Undo Commit') { return; }
    await worktree.undoLastCommit('soft');
}

async function editCommitMessage(
    hash: string,
    extensionUri: vscode.Uri | undefined,
    generateRewordCommitMessage: GenerateRewordCommitMessageUseCase,
    runtimeTargets: RuntimeCommandTargets = {},
): Promise<void> {
    const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
    const runtimeRepo = repository;
    const current = await runtimeRepo.getCommitMessage(hash);
    const message = await promptForCommitMessage(current, `Reword commit ${hash.substring(0, 7)}`, extensionUri, {
        generateMessage: async (signal) => {
            const result = await generateRewordCommitMessage.execute(runtimeRepo, hash, current, signal);
            return result.message;
        },
    });
    if (!message?.trim()) { return; }
    await assertRuntimeNoUnmergedFiles(worktree, 'editing commit messages');
    await worktree.rewordCommit(hash, message.trim());
}

async function fixupStagedChanges(hash: string, runtimeTargets: RuntimeCommandTargets): Promise<void> {
    const worktree = requireRuntimeWorktree(runtimeTargets);
    await assertRuntimeNoUnmergedFiles(worktree, 'fixing up commits');
    await worktree.fixupCommits([hash]);
}

async function squashSelectedCommits(hashes: readonly string[], runtimeTargets: RuntimeCommandTargets = {}): Promise<void> {
    const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
    await assertRuntimeNoUnmergedFiles(worktree, 'squashing commits');
    const ordered = await orderSelectedCommits(repository, hashes, 'oldestFirst');
    if (ordered.length < 2) { throw new Error('Select at least two commits to squash.'); }
    await validateSquashCommitRange(repository, ordered);

    const defaultMessage = firstCommitMessageLine(await repository.getCommitMessage(ordered[0]!));
    const message = await vscode.window.showInputBox({
        prompt: `Squash ${ordered.length} commits into one message:`,
        value: defaultMessage,
    });
    if (!message?.trim()) { return; }

    await worktree.squashCommits(ordered, message.trim());
}

function firstCommitMessageLine(message: string): string {
    return message.split(/\r?\n/)[0]?.trim() ?? '';
}

async function dropCommits(hashes: readonly string[], runtimeTargets: RuntimeCommandTargets): Promise<void> {
    const worktree = requireRuntimeWorktree(runtimeTargets);
    await assertRuntimeNoUnmergedFiles(worktree, 'dropping commits');
    const choice = await showModalWarningMessage(`Drop ${hashes.length === 1 ? 'this commit' : `${hashes.length} commits`}?`, 'Drop');
    if (choice !== 'Drop') { return; }
    for (const hash of hashes) {
        await worktree.dropCommit(hash);
    }
}

async function pushAllUpToHere(hash: string, runtimeTargets: RuntimeCommandTargets): Promise<void> {
    const { repository, worktree } = requireRuntimeTargets(runtimeTargets);
    const remotes = await repository.listRemotes();
    const remote = remotes[0];
    if (!remote) { throw new Error('No Git remote configured.'); }
    const branch = await currentBranchName(repository);
    const choice = await showModalWarningMessage(`Push ${hash.substring(0, 7)} to ${remote}/${branch}?`, 'Push');
    if (choice !== 'Push') { return; }
    await worktree.pushRef(remote, hash, `refs/heads/${branch}`, {});
}

async function validateSquashCommitRange(repository: CommitSquashReader, hashes: readonly string[]): Promise<void> {
    let previousHash: string | undefined;
    for (const [index, hash] of hashes.entries()) {
        const commit = await repository.getCommitDetails(hash);
        if (commit.parentHashes.length > 1) { throw new Error('Squash Commits is not supported for merge commits.'); }
        if (index > 0 && commit.parentHashes[0] !== previousHash) {
            throw new Error('Squash Commits requires a contiguous linear commit selection.');
        }
        previousHash = hash;
    }
}

async function currentBranchName(repository: CommitReferenceReader): Promise<string> {
    return (await repository.listBranches()).find((branch) => branch.isCurrent)?.name ?? 'HEAD';
}

async function assertRuntimeNoUnmergedFiles(worktree: CommitStatusReader, operation: string): Promise<void> {
    const status = await worktree.getStatus();
    if (status.conflicts.length > 0) {
        throw new Error(`Resolve existing merge/rebase conflicts before ${operation}.`);
    }
}
