import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../application/ports/git-repository';
import type { GitStatusEntry } from '../../core/git/domain/GitStatus';
import type { GitSubmodule } from '../../core/git/domain/GitWorktree';
import type { ChangesOperationStatusPush, ChangesSortPreference, ChangesToolbarCommand, ChangesViewPreference, ChangesWebviewToExtensionMessage, ChangesExtensionToWebviewMessage } from '../../protocol/changes/messages';
import { CommitMode, ConflictState, RepositoryState } from '../../protocol/changes/types';
import type { StatusData, StatusEntry } from '../../protocol/changes/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import { OperationStatus } from '../../protocol/shared/operation';
import { SubmoduleStatus } from '../../protocol/shared/repo';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import type { RepositoryRegistry } from '../repositories/RepositoryRegistry';
import type { GitRepository as RuntimeGitRepository, Worktree } from '../../application/ports/git-topology';
import { confirmTypedPhrase, showModalWarningMessage } from '../utils/confirmation';
import { showBranchNameInput } from '../utils/branch-name-input';
import { createReadonlyDocumentUri } from '../utils/readonly-diff-documents';
import { openStatusGitlinkDiff } from '../utils/gitlink-diff';
import { toProtocolSubmoduleStatus, toRepositoryLocator, toWorktreeLocator } from '../mapping/toProtocol';
import { GenerateCommitMessageUseCase } from '../../application/usecases/changes/generate-commit-message';
import { VscodeLanguageModelCommitMessageGenerator } from '../adapters/vscode/vscode-language-model-commit-message-generator';
import { ScopedGitRepository } from '../git/scoped-git-repository';
import { createErrorPayload, isAbortError } from './errorSerialization';
import { notifyConflictsDetected, openAllThreeWayMergeEditors, openThreeWayMergeEditor } from '../utils/merge-editor';
import { operationActionsForStatus } from '../utils/operation-feedback';
import { stableRepoContextId } from '../repositories/repo-context-id';

type PostMessage = (msg: ChangesExtensionToWebviewMessage) => void;
type RefreshCallback = () => Promise<void>;
type RepositoryUpdatedCallback = () => Promise<void>;
interface ToolbarRuntimeTargets {
    readonly repository?: RuntimeGitRepository;
    readonly worktree?: Worktree;
}

interface DiffRuntimeTargets {
    readonly repository?: RuntimeGitRepository;
    readonly worktree?: Worktree;
}

export class ChangesMessageRouter {
    private knownSubmodulePaths: ReadonlySet<string> | undefined;
    private commitMessageGenerationAbortController: AbortController | undefined;
    private readonly submoduleCommitMessageGenerationAbortControllers = new Map<string, AbortController>();
    private operationSequence = 0;

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly refresh: RefreshCallback,
        private readonly onRepositoryUpdated: RepositoryUpdatedCallback = async () => {},
        private readonly generateCommitMessage = new GenerateCommitMessageUseCase(new VscodeLanguageModelCommitMessageGenerator()),
        private readonly runtimeRepositories?: RepositoryRegistry,
    ) {}

    setKnownSubmodulePaths(paths: readonly string[]): void {
        this.knownSubmodulePaths = new Set(paths);
    }

    async handle(msg: ChangesWebviewToExtensionMessage): Promise<void> {
        try {
            await this.dispatch(msg);
        } catch (error) {
            this.postChangesError(error, {
                requestId: requestIdOf(msg),
                operation: msg.type,
                code: errorCodeFor(msg),
            });
            try {
                await this.refresh();
            } catch (refreshError) {
                this.postChangesError(refreshError, {
                    operation: 'changes/refreshAfterError',
                    code: 'refreshFailed',
                });
            }
        }
    }

    private async dispatch(msg: ChangesWebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'changes/ready':
                await this.refresh();
                return;

            case 'changes/viewModeChanged':
                await updateChangesViewContexts(msg.asTree ? 'tree' : 'list', undefined);
                return;

            case 'changes/preferencesChanged':
                await updateChangesViewContexts(msg.viewMode, msg.sortMode);
                return;

            case 'changes/toolbarCommand':
                await this.handleToolbarCommand(msg.command);
                return;
        }

        const repo = this.repositories.requireRepository();
        const currentRuntimeWorktree = () => this.requireCurrentRuntimeWorktree();

        switch (msg.type) {

            case 'changes/stageFile':
                await currentRuntimeWorktree().stage([msg.filePath]);
                await this.refresh();
                break;

            case 'changes/stageFiles':
                await currentRuntimeWorktree().stage(msg.filePaths);
                await this.refresh();
                break;

            case 'changes/unstageFile':
                await currentRuntimeWorktree().unstage([msg.filePath]);
                await this.refresh();
                break;

            case 'changes/unstageFiles':
                await currentRuntimeWorktree().unstage(msg.filePaths);
                await this.refresh();
                break;

            case 'changes/stageAll':
                await currentRuntimeWorktree().stageAll();
                await this.refresh();
                break;

            case 'changes/unstageAll':
                await currentRuntimeWorktree().unstageAll();
                await this.refresh();
                break;

            case 'changes/discardFile': {
                const choice = await showModalWarningMessage(
                    `Discard changes to "${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await discardRuntimeFile(currentRuntimeWorktree(), msg.filePath);
                    await this.refresh();
                }
                break;
            }

            case 'changes/discardFiles': {
                const count = msg.filePaths.length;
                const choice = await showModalWarningMessage(
                    `Discard changes to ${count} file${count === 1 ? '' : 's'}? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    for (const filePath of msg.filePaths) {
                        await discardRuntimeFile(currentRuntimeWorktree(), filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/discardAll': {
                const confirmed = await confirmTypedPhrase('Discard all changes? This cannot be undone.', 'DISCARD ALL');
                if (confirmed) {
                    try {
                        await currentRuntimeWorktree().unstageAll();
                    } catch (error) {
                        this.postChangesError(error, {
                            operation: 'changes/discardAll:unstage',
                            code: 'gitOperationFailed',
                        });
                    }
                    const status = await currentRuntimeWorktree().getStatus();
                    for (const entry of status.unstaged) {
                        await discardRuntimeFile(currentRuntimeWorktree(), entry.filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/markResolved':
                await currentRuntimeWorktree().markResolved([msg.filePath]);
                await this.refresh();
                break;

            case 'changes/markResolvedFiles':
                await currentRuntimeWorktree().markResolved(msg.filePaths);
                await this.refresh();
                break;

            case 'changes/acceptOurs':
                await currentRuntimeWorktree().acceptOurs([msg.filePath]);
                await this.refresh();
                break;

            case 'changes/acceptOursFiles':
                await currentRuntimeWorktree().acceptOurs(msg.filePaths);
                await this.refresh();
                break;

            case 'changes/acceptTheirs':
                await currentRuntimeWorktree().acceptTheirs([msg.filePath]);
                await this.refresh();
                break;

            case 'changes/acceptTheirsFiles':
                await currentRuntimeWorktree().acceptTheirs(msg.filePaths);
                await this.refresh();
                break;

            case 'changes/acceptAllTheirs': {
                const choice = await showModalWarningMessage(
                    'Accept incoming changes for all conflicts?', 'Accept All Theirs',
                );
                if (choice !== 'Accept All Theirs') { break; }
                const status = await currentRuntimeWorktree().getStatus();
                const conflictPaths = status.conflicts.map((entry) => entry.filePath);
                await currentRuntimeWorktree().acceptTheirs(conflictPaths);
                await this.refresh();
                break;
            }

            case 'changes/commit': {
                const message = msg.message.trim();
                if (!message) {
                    this.postMessage({
                        type: 'changes/commitResult',
                        success: false,
                        ...createErrorPayload(new Error('Commit message cannot be empty.'), {
                            code: 'validationFailed',
                            operation: msg.type,
                            recoverable: true,
                        }),
                    });
                    return;
                }
                try {
                    switch (msg.mode) {
                        case CommitMode.Amend:
                            await currentRuntimeWorktree().amendCommit(message, {});
                            break;
                        case CommitMode.CommitPush:
                            await currentRuntimeWorktree().commit(message, {});
                            await currentRuntimeWorktree().push(undefined, {});
                            break;
                        case CommitMode.CommitSync:
                            await currentRuntimeWorktree().commit(message, {});
                            await currentRuntimeWorktree().pull({ rebase: true });
                            await currentRuntimeWorktree().push(undefined, {});
                            break;
                        default:
                            await currentRuntimeWorktree().commit(message, {});
                            break;
                    }
                    this.postMessage({ type: 'changes/commitResult', success: true });
                    await vscode.window.showInformationMessage('Committed successfully.');
                } catch (error) {
                    this.postMessage({
                        type: 'changes/commitResult',
                        success: false,
                        ...createErrorPayload(error, {
                            code: 'gitOperationFailed',
                            operation: msg.type,
                            recoverable: true,
                        }),
                    });
                }
                await this.refresh();
                break;
            }

            case 'changes/generateCommitMessage': {
                this.commitMessageGenerationAbortController?.abort();
                const controller = new AbortController();
                this.commitMessageGenerationAbortController = controller;
                try {
                    const result = await this.generateCommitMessage.execute(repo, controller.signal);
                    this.postMessage({
                        type: 'changes/generatedCommitMessage',
                        requestId: msg.requestId,
                        message: result.message,
                    });
                } catch (error) {
                    if (isAbortError(error)) { break; }
                    this.postChangesError(error, {
                        requestId: msg.requestId,
                        operation: msg.type,
                        code: 'languageModelFailed',
                    });
                } finally {
                    if (this.commitMessageGenerationAbortController === controller) {
                        this.commitMessageGenerationAbortController = undefined;
                    }
                }
                break;
            }

            case 'changes/generateSubmoduleCommitMessage': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                this.submoduleCommitMessageGenerationAbortControllers.get(submodulePath)?.abort();
                const controller = new AbortController();
                this.submoduleCommitMessageGenerationAbortControllers.set(submodulePath, controller);
                try {
                    const result = await this.generateCommitMessage.execute(new ScopedGitRepository(repo, submodulePath), controller.signal);
                    this.postMessage({
                        type: 'changes/submoduleGeneratedCommitMessage',
                        requestId: msg.requestId,
                        path: submodulePath,
                        message: result.message,
                    });
                } catch (error) {
                    if (isAbortError(error)) { break; }
                    this.postChangesError(error, {
                        requestId: msg.requestId,
                        operation: msg.type,
                        code: 'languageModelFailed',
                    });
                } finally {
                    if (this.submoduleCommitMessageGenerationAbortControllers.get(submodulePath) === controller) {
                        this.submoduleCommitMessageGenerationAbortControllers.delete(submodulePath);
                    }
                }
                break;
            }

            case 'changes/submoduleCommit': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const message = msg.message.trim();
                if (!message) {
                    this.postMessage({
                        type: 'changes/submoduleCommitResult',
                        path: submodulePath,
                        success: false,
                        ...createErrorPayload(new Error('Commit message cannot be empty.'), {
                            code: 'validationFailed',
                            operation: msg.type,
                            recoverable: true,
                        }),
                    });
                    return;
                }
                const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                try {
                    switch (msg.mode) {
                        case CommitMode.Amend:
                            await runtimeSubmoduleWorktree.amendCommit(message, {});
                            break;
                        case CommitMode.CommitPush:
                            await runtimeSubmoduleWorktree.commit(message, {});
                            await runtimeSubmoduleWorktree.push(undefined, {});
                            break;
                        case CommitMode.CommitSync:
                            await runtimeSubmoduleWorktree.commit(message, {});
                            await runtimeSubmoduleWorktree.pull({ rebase: true });
                            await runtimeSubmoduleWorktree.push(undefined, {});
                            break;
                        default:
                            await runtimeSubmoduleWorktree.commit(message, {});
                            break;
                    }
                    this.postMessage({ type: 'changes/submoduleCommitResult', path: submodulePath, success: true });
                    await vscode.window.showInformationMessage(`Committed ${submodulePath} successfully.`);
                } catch (error) {
                    this.postMessage({
                        type: 'changes/submoduleCommitResult',
                        path: submodulePath,
                        success: false,
                        ...createErrorPayload(error, {
                            code: 'gitOperationFailed',
                            operation: msg.type,
                            recoverable: true,
                        }),
                    });
                }
                await this.refresh();
                break;
            }

            case 'changes/submoduleToolbarCommand': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.handleToolbarCommandForRepo(
                    new ScopedGitRepository(repo, submodulePath),
                    msg.command,
                    {
                        repository: this.runtimeSubmoduleRepository(repo, submodulePath),
                        worktree: this.runtimeSubmoduleWorktree(repo, submodulePath),
                    },
                );
                break;
            }

            case 'changes/openFile': {
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.open', uri);
                break;
            }

            case 'changes/openSubmodule': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.filePath);
                const uri = vscode.Uri.file(path.join(repo.cwd, submodulePath));
                const choice = await vscode.window.showQuickPick(
                    ['Open in New Window', 'Open in Current Window'],
                    { placeHolder: 'Open submodule' },
                );
                if (!choice) { break; }
                await vscode.commands.executeCommand('vscode.openFolder', uri, choice === 'Open in New Window');
                break;
            }

            case 'changes/openMergeEditor': {
                await openThreeWayMergeEditor(repo, msg.filePath);
                break;
            }

            case 'changes/openFirstMergeEditor': {
                await this.openFirstMergeEditor(repo);
                break;
            }

            case 'changes/openAllMergeEditors': {
                await this.openAllMergeEditors(repo);
                break;
            }

            case 'changes/openDiff': {
                if (msg.isSubmodule) {
                    await openSubmoduleGitlinkDiff(repo, msg);
                } else {
                    await openStatusDiff(repo, msg, {
                        repository: this.currentRuntimeRepository(),
                        worktree: this.currentRuntimeWorktree(),
                    });
                }
                break;
            }

            case 'changes/openSubmoduleDiff': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await openStatusDiff(new ScopedGitRepository(repo, submodulePath), msg, {
                    repository: this.runtimeSubmoduleRepository(repo, submodulePath),
                    worktree: this.runtimeSubmoduleWorktree(repo, submodulePath),
                });
                break;
            }

            case 'changes/submoduleOpenFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(repo.cwd, submodulePath, msg.filePath)));
                break;
            }

            case 'changes/submoduleStageFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).stage([msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleStageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).stage(msg.filePaths);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).unstage([msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).unstage(msg.filePaths);
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const choice = await showModalWarningMessage(
                    `Discard changes to "${submodulePath}/${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await discardRuntimeFile(this.requireRuntimeSubmoduleWorktree(repo, submodulePath), msg.filePath);
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleDiscardFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const count = msg.filePaths.length;
                const choice = await showModalWarningMessage(
                    `Discard changes to ${count} file${count === 1 ? '' : 's'} inside "${submodulePath}"? This cannot be undone.`,
                    'Discard',
                );
                if (choice === 'Discard') {
                    const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                    for (const filePath of msg.filePaths) {
                        await discardRuntimeFile(runtimeSubmoduleWorktree, filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleOpenMergeEditor': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await openThreeWayMergeEditor(new ScopedGitRepository(repo, submodulePath), msg.filePath);
                break;
            }

            case 'changes/submoduleOpenFirstMergeEditor': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.openFirstMergeEditor(new ScopedGitRepository(repo, submodulePath));
                break;
            }

            case 'changes/submoduleOpenAllMergeEditors': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.openAllMergeEditors(new ScopedGitRepository(repo, submodulePath));
                break;
            }

            case 'changes/submoduleMarkResolved': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).markResolved([msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptOurs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).acceptOurs([msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptTheirs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).acceptTheirs([msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/stash':
                await currentRuntimeWorktree().stash(msg.message, {});
                await this.refresh();
                break;

            case 'changes/stashStaged':
                await currentRuntimeWorktree().stash(msg.message, { staged: true });
                await this.refresh();
                break;

            case 'changes/stashSelectedFiles': {
                if (msg.filePaths.length === 0) { break; }
                const message = msg.message?.trim();
                await currentRuntimeWorktree().stash(message, { includeUntracked: msg.includeUntracked, paths: msg.filePaths });
                await this.refresh();
                break;
            }

            case 'changes/stashPop':
                await currentRuntimeWorktree().popStash(stashRef(msg.index), {});
                await this.refresh();
                break;

            case 'changes/stashApply':
                await currentRuntimeWorktree().applyStash(stashRef(msg.index), {});
                await this.refresh();
                break;

            case 'changes/stashDrop': {
                const choice = await showModalWarningMessage('Drop this stash entry? This cannot be undone.', 'Drop');
                if (choice === 'Drop') {
                    await currentRuntimeWorktree().dropStash(stashRef(msg.index));
                    await this.refresh();
                }
                break;
            }

            case 'changes/getStashFiles': {
                const files = await currentRuntimeWorktree().getStashFiles(stashRef(msg.index));
                this.postMessage({
                    type: 'changes/stashFiles',
                    requestId: msg.requestId,
                    index: msg.index,
                    files: files.map((f) => ({ status: f.status, filePath: f.filePath, origPath: f.origPath })),
                });
                break;
            }

            case 'changes/openStashDiff': {
                await openStashDiff(msg, { repository: this.currentRuntimeRepository() });
                break;
            }

            case 'changes/submoduleStash':
            case 'changes/submoduleStashSelectedFiles':
            case 'changes/submoduleStashPop':
            case 'changes/submoduleStashApply':
            case 'changes/submoduleStashDrop':
            case 'changes/getSubmoduleStashFiles':
            case 'changes/openSubmoduleStashDiff': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = () => this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                switch (msg.type) {
                    case 'changes/submoduleStash':
                        await runtimeSubmoduleWorktree().stash(msg.message, {});
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashSelectedFiles': {
                        if (msg.filePaths.length === 0) { break; }
                        const message = msg.message?.trim();
                        await runtimeSubmoduleWorktree().stash(message, { includeUntracked: msg.includeUntracked, paths: msg.filePaths });
                        await this.refresh();
                        break;
                    }
                    case 'changes/submoduleStashPop':
                        await runtimeSubmoduleWorktree().popStash(stashRef(msg.index), {});
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashApply':
                        await runtimeSubmoduleWorktree().applyStash(stashRef(msg.index), {});
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashDrop': {
                        const choice = await showModalWarningMessage('Drop this submodule stash entry? This cannot be undone.', 'Drop');
                        if (choice === 'Drop') {
                            await runtimeSubmoduleWorktree().dropStash(stashRef(msg.index));
                            await this.refresh();
                        }
                        break;
                    }
                    case 'changes/getSubmoduleStashFiles': {
                        const files = await runtimeSubmoduleWorktree().getStashFiles(stashRef(msg.index));
                        this.postMessage({
                            type: 'changes/submoduleStashFiles',
                            requestId: msg.requestId,
                            path: submodulePath,
                            index: msg.index,
                            files: files.map((f) => ({ status: f.status, filePath: f.filePath, origPath: f.origPath })),
                        });
                        break;
                    }
                    case 'changes/openSubmoduleStashDiff':
                        await openStashDiff(
                            msg,
                            { repository: this.runtimeSubmoduleRepository(repo, submodulePath) },
                        );
                        break;
                }
                break;
            }

            case 'changes/submoduleUpdate': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.path);
                await repo.updateSubmodule(submodulePath);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUpdateAll': {
                const choice = await showModalWarningMessage(
                    'Update all submodules? This may initialize nested repositories and change working tree files.',
                    'Update All',
                );
                if (choice === 'Update All') {
                    await repo.updateAllSubmodules();
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleStageAll': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).stageAll();
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageAll': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await this.requireRuntimeSubmoduleWorktree(repo, submodulePath).unstageAll();
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardAll': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const confirmed = await confirmTypedPhrase(
                    `Discard all changes inside "${submodulePath}"? This cannot be undone.`,
                    'DISCARD ALL',
                );
                if (confirmed) {
                    const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                    const status = await runtimeSubmoduleWorktree.getStatus();
                    const stagedPaths = status.staged.map((entry) => entry.filePath);
                    if (stagedPaths.length > 0) { await runtimeSubmoduleWorktree.unstage(stagedPaths); }
                    for (const entry of status.unstaged) {
                        await discardRuntimeFile(runtimeSubmoduleWorktree, entry.filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleAcceptAllTheirs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const choice = await showModalWarningMessage(
                    `Accept incoming changes for all conflicts inside "${submodulePath}"?`, 'Accept All Theirs',
                );
                if (choice !== 'Accept All Theirs') { break; }
                const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                const status = await runtimeSubmoduleWorktree.getStatus();
                const conflictPaths = status.conflicts.map((entry) => entry.filePath);
                await runtimeSubmoduleWorktree.acceptTheirs(conflictPaths);
                await this.refresh();
                break;
            }

            case 'changes/getSubmoduleStatus': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.path);
                const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                const [status, stashPage] = await Promise.all([
                    runtimeSubmoduleWorktree.getStatus(),
                    runtimeSubmoduleWorktree.listStashes({ limit: Number.MAX_SAFE_INTEGER }),
                ]);
                this.postMessage({
                    type: 'changes/submoduleStatusData',
                    requestId: msg.requestId,
                    path: msg.path,
                    data: {
                        ...(runtimeSubmoduleWorktree.branch ? { currentBranch: runtimeSubmoduleWorktree.branch } : {}),
                        staged: status.staged.map(toStatusEntry),
                        unstaged: status.unstaged.map(toStatusEntry),
                        conflicts: status.conflicts.map(toStatusEntry),
                        conflictState: toProtocolConflictState(status.conflictState),
                        stashes: stashPage.items,
                    },
                });
                break;
            }

            case 'changes/continueOp':
                if (msg.conflictState === ConflictState.Merge) {
                    await currentRuntimeWorktree().continueMerge();
                } else {
                    await currentRuntimeWorktree().continueRebase();
                }
                await this.refresh();
                break;

            case 'changes/abortOp': {
                const opName = msg.conflictState === ConflictState.Merge ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName}?`, 'Abort');
                if (choice === 'Abort') {
                    if (msg.conflictState === ConflictState.Merge) {
                        await currentRuntimeWorktree().abortMerge();
                    } else {
                        await currentRuntimeWorktree().abortRebase();
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleContinueOp': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                if (msg.conflictState === ConflictState.Merge) {
                    await runtimeSubmoduleWorktree.continueMerge();
                } else {
                    await runtimeSubmoduleWorktree.continueRebase();
                }
                await this.refresh();
                break;
            }

            case 'changes/submoduleAbortOp': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const opName = msg.conflictState === ConflictState.Merge ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName} in "${submodulePath}"?`, 'Abort');
                if (choice === 'Abort') {
                    const runtimeSubmoduleWorktree = this.requireRuntimeSubmoduleWorktree(repo, submodulePath);
                    if (msg.conflictState === ConflictState.Merge) {
                        await runtimeSubmoduleWorktree.abortMerge();
                    } else {
                        await runtimeSubmoduleWorktree.abortRebase();
                    }
                    await this.refresh();
                }
                break;
            }

            default:
                break;
        }
    }

    private currentRuntimeWorktree(): Worktree | undefined {
        const context = this.repositories.currentContext;
        if (!context || !this.runtimeRepositories) { return undefined; }
        try {
            return this.runtimeRepositories.resolveWorktree(toWorktreeLocator(context));
        } catch {
            return undefined;
        }
    }

    private requireCurrentRuntimeWorktree(): Worktree {
        const worktree = this.currentRuntimeWorktree();
        if (!worktree) {
            throw new Error('Runtime Worktree is required for this git operation.');
        }
        return worktree;
    }

    private currentRuntimeRepository(): RuntimeGitRepository | undefined {
        const context = this.repositories.currentContext;
        if (!context || !this.runtimeRepositories) { return undefined; }
        try {
            return this.runtimeRepositories.resolveRepository(toRepositoryLocator(context));
        } catch {
            return undefined;
        }
    }

    private runtimeSubmoduleWorktree(repo: GitRepository, submodulePath: string): Worktree | undefined {
        if (!this.runtimeRepositories) { return undefined; }
        const submoduleCwd = path.resolve(repo.cwd, submodulePath);
        const submoduleId = stableRepoContextId(submoduleCwd);
        try {
            return this.runtimeRepositories.resolveWorktree({
                repoId: submoduleId,
                worktreeId: submoduleId,
                path: submoduleCwd,
            });
        } catch {
            return undefined;
        }
    }

    private requireRuntimeSubmoduleWorktree(repo: GitRepository, submodulePath: string): Worktree {
        const worktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
        if (!worktree) {
            throw new Error(`Runtime Worktree is required for submodule "${submodulePath}".`);
        }
        return worktree;
    }

    private runtimeSubmoduleRepository(repo: GitRepository, submodulePath: string): RuntimeGitRepository | undefined {
        if (!this.runtimeRepositories) { return undefined; }
        const submoduleCwd = path.resolve(repo.cwd, submodulePath);
        const submoduleId = stableRepoContextId(submoduleCwd);
        try {
            return this.runtimeRepositories.resolveRepository({
                repoId: submoduleId,
                kind: 'submodule',
                path: submoduleCwd,
            });
        } catch {
            return undefined;
        }
    }

    async handleToolbarCommand(command: ChangesToolbarCommand): Promise<void> {
        if (await this.handleGlobalToolbarCommand(command)) { return; }
        await this.handleToolbarCommandForRepo(this.repositories.requireRepository(), command);
    }

    async handleToolbarCommandForRepo(repo: GitRepository, command: ChangesToolbarCommand, runtimeTargets?: ToolbarRuntimeTargets): Promise<void> {
        if (await this.handleGlobalToolbarCommand(command)) { return; }
        const canUseCurrentRuntime = repo === this.repositories.currentRepository;
        const runtimeRepository = runtimeTargets?.repository ?? (canUseCurrentRuntime ? this.currentRuntimeRepository() : undefined);
        const runtimeWorktree = runtimeTargets?.worktree ?? (canUseCurrentRuntime ? this.currentRuntimeWorktree() : undefined);
        const requireRuntimeRepository = () => {
            if (!runtimeRepository) { throw new Error('Runtime GitRepository is required for this git operation.'); }
            return runtimeRepository;
        };
        const requireRuntimeWorktree = () => {
            if (!runtimeWorktree) { throw new Error('Runtime Worktree is required for this git operation.'); }
            return runtimeWorktree;
        };
        switch (command) {
            case 'pull':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().pull({}), 'Pull stopped with conflicts.'));
                return;
            case 'push':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeWorktree().push(undefined, {});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'fetch':
                await this.runTrackedToolbarOperation(command, async () => {
                    const remote = await pickRemote('Fetch remote', requireRuntimeRepository());
                    if (!remote) { return undefined; }
                    await requireRuntimeRepository().fetch(remote, {});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'fetchAll':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeRepository().fetchAll({});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'sync':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, async () => {
                        await requireRuntimeWorktree().pull({ rebase: true });
                        await requireRuntimeWorktree().push(undefined, {});
                    }, 'Sync stopped with conflicts.'));
                return;
            case 'pullRebase':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().pull({ rebase: true }), 'Pull with rebase stopped with conflicts.'));
                return;
            case 'pullFrom':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, async () => {
                        const ref = await pickRemoteBranch('Pull from remote branch', requireRuntimeRepository());
                        if (!ref) { return; }
                        const parsed = remoteBranchName(ref);
                        await requireRuntimeRepository().fetch(parsed.remote, {});
                        await requireRuntimeWorktree().merge(ref, {});
                    }, 'Pull from remote stopped with conflicts.'));
                return;
            case 'pushForce':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeWorktree().push(undefined, { forceWithLease: true });
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'pushTo':
                await this.runTrackedToolbarOperation(command, async () => {
                    await pushCurrentBranchToPickedRemote(requireRuntimeRepository(), requireRuntimeWorktree(), false);
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'pushToForce':
                await this.runTrackedToolbarOperation(command, async () => {
                    await pushCurrentBranchToPickedRemote(requireRuntimeRepository(), requireRuntimeWorktree(), true);
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'fetchPrune':
                await this.runTrackedToolbarOperation(command, async () => {
                    const remote = await pickRemote('Fetch and prune remote', requireRuntimeRepository());
                    if (!remote) { return undefined; }
                    await requireRuntimeRepository().pruneRemote(remote);
                    await requireRuntimeRepository().fetch(remote, { prune: true });
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'checkout': {
                const branch = await pickBranch('Checkout branch', requireRuntimeRepository());
                if (!branch) { return; }
                await requireRuntimeWorktree().checkout(branch, {});
                await this.refresh();
                return;
            }
            case 'undoLastCommit': {
                const choice = await showModalWarningMessage('Undo the last commit and keep its changes staged?', 'Undo Commit');
                if (choice !== 'Undo Commit') { return; }
                await requireRuntimeWorktree().undoLastCommit('soft');
                await this.refresh();
                return;
            }
            case 'abortRebase': {
                const choice = await showModalWarningMessage('Abort the current rebase?', 'Abort Rebase');
                if (choice !== 'Abort Rebase') { return; }
                await requireRuntimeWorktree().abortRebase();
                await this.refresh();
                return;
            }
            case 'mergeBranch': {
                const branch = await pickBranch('Merge branch', requireRuntimeRepository());
                if (!branch) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().merge(branch, {}), 'Merge stopped with conflicts.'));
                return;
            }
            case 'rebaseBranch': {
                const branch = await pickBranch('Rebase current branch onto', requireRuntimeRepository());
                if (!branch) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().rebase(branch, undefined, {}), 'Rebase stopped with conflicts.'));
                return;
            }
            case 'createBranch': {
                const branch = await inputBranchName('Create branch');
                if (!branch) { return; }
                await requireRuntimeWorktree().checkoutNewBranch(branch, undefined);
                await this.refresh();
                return;
            }
            case 'createBranchFrom': {
                const branch = await inputBranchName('Create branch');
                if (!branch) { return; }
                const startPoint = await pickRef('Create branch from', requireRuntimeRepository());
                if (!startPoint) { return; }
                await requireRuntimeWorktree().checkoutNewBranch(branch, startPoint);
                await this.refresh();
                return;
            }
            case 'renameBranch': {
                const current = await currentBranchName(requireRuntimeRepository());
                const oldName = await pickLocalBranch('Rename branch', requireRuntimeRepository(), current);
                if (!oldName) { return; }
                const newName = await inputText('New branch name', oldName);
                if (!newName || newName === oldName) { return; }
                await requireRuntimeRepository().renameBranch(oldName, newName);
                await this.refresh();
                return;
            }
            case 'deleteBranch': {
                const branch = await pickLocalBranch('Delete branch', requireRuntimeRepository());
                if (!branch) { return; }
                const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                await requireRuntimeRepository().deleteBranch(branch, false);
                await this.refresh();
                return;
            }
            case 'deleteRemoteBranch': {
                await this.runTrackedToolbarOperation(command, async () => {
                    const selected = await pickRemoteBranch('Delete remote branch', requireRuntimeRepository());
                    if (!selected) { return undefined; }
                    const parsed = remoteBranchName(selected);
                    const choice = await showModalWarningMessage(`Delete remote branch "${selected}"?`, 'Delete');
                    if (choice !== 'Delete') { return undefined; }
                    await requireRuntimeRepository().deleteRemoteBranch(parsed.remote, parsed.branch);
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            }
            case 'publishBranch': {
                await this.runTrackedToolbarOperation(command, async () => {
                    const branch = await currentBranchName(requireRuntimeRepository());
                    if (!branch || branch === 'HEAD') { throw new Error('No local branch is checked out.'); }
                    const remote = await pickRemote('Publish branch to remote', requireRuntimeRepository());
                    if (!remote) { return undefined; }
                    await requireRuntimeWorktree().pushBranch(remote, branch, { setUpstream: true });
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            }
            case 'addRemote': {
                const name = await inputText('Remote name');
                if (!name) { return; }
                const url = await inputText('Remote URL');
                if (!url) { return; }
                await requireRuntimeRepository().addRemote(name, url);
                await this.refresh();
                return;
            }
            case 'removeRemote': {
                const remote = await pickRemote('Remove remote', requireRuntimeRepository());
                if (!remote) { return; }
                const choice = await showModalWarningMessage(`Remove remote "${remote}"?`, 'Remove');
                if (choice !== 'Remove') { return; }
                await requireRuntimeRepository().removeRemote(remote);
                await this.refresh();
                return;
            }
            case 'stash':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeWorktree().stash(undefined, {});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'stashIncludeUntracked':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeWorktree().stash(undefined, { includeUntracked: true });
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'stashStaged':
                await this.runTrackedToolbarOperation(command, async () => {
                    await requireRuntimeWorktree().stash(undefined, { staged: true });
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'applyLatestStash':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().applyStash(stashRef(0), {}), 'Apply stash stopped with conflicts.'));
                return;
            case 'applyStash': {
                const index = await pickStash('Apply stash', requireRuntimeWorktree());
                if (index === undefined) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => requireRuntimeWorktree().applyStash(stashRef(index), {}), 'Apply stash stopped with conflicts.'));
                return;
            }
            case 'popLatestStash':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => popRuntimeStashWithLocalChangesHint(requireRuntimeWorktree(), stashRef(0)), 'Pop stash stopped with conflicts.'));
                return;
            case 'popStash': {
                const index = await pickStash('Pop stash', requireRuntimeWorktree());
                if (index === undefined) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => popRuntimeStashWithLocalChangesHint(requireRuntimeWorktree(), stashRef(index)), 'Pop stash stopped with conflicts.'));
                return;
            }
            case 'dropStash': {
                const index = await pickStash('Drop stash', requireRuntimeWorktree());
                if (index === undefined) { return; }
                const choice = await showModalWarningMessage(`Drop stash@{${index}}? This cannot be undone.`, 'Drop');
                if (choice !== 'Drop') { return; }
                await requireRuntimeWorktree().dropStash(stashRef(index));
                await this.refresh();
                return;
            }
            case 'dropAllStashes': {
                const confirmed = await confirmTypedPhrase('Drop all stashes? This cannot be undone.', 'DROP ALL STASHES');
                if (!confirmed) { return; }
                await requireRuntimeWorktree().clearStashes();
                await this.refresh();
                return;
            }
            case 'viewStash': {
                const index = await pickStash('View stash', requireRuntimeWorktree());
                if (index === undefined) { return; }
                const stash = stashRef(index);
                const content = await requireRuntimeWorktree().getStashSummary(stash);
                const document = await vscode.workspace.openTextDocument({
                    content: content || stash,
                    language: 'plaintext',
                });
                await vscode.window.showTextDocument(document);
                return;
            }
            case 'createTag': {
                const tag = await inputText('Create tag');
                if (!tag) { return; }
                await requireRuntimeRepository().createTag(tag, 'HEAD', undefined);
                await this.refresh();
                return;
            }
            case 'deleteTag': {
                const tag = await pickTag('Delete tag', requireRuntimeRepository());
                if (!tag) { return; }
                const choice = await showModalWarningMessage(`Delete tag "${tag}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                await requireRuntimeRepository().deleteTag(tag);
                await this.refresh();
                return;
            }
            case 'deleteRemoteTag': {
                await this.runTrackedToolbarOperation(command, async () => {
                    const tag = await pickTag('Delete remote tag', requireRuntimeRepository());
                    if (!tag) { return undefined; }
                    const remote = await pickRemote('Delete tag from remote', requireRuntimeRepository());
                    if (!remote) { return undefined; }
                    const choice = await showModalWarningMessage(`Delete tag "${tag}" from "${remote}"?`, 'Delete');
                    if (choice !== 'Delete') { return undefined; }
                    await requireRuntimeWorktree().pushRef(remote, '', `refs/tags/${tag}`, {});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            }
            case 'pushTags': {
                await this.runTrackedToolbarOperation(command, async () => {
                    const remote = await pickRemote('Push tags to remote', requireRuntimeRepository());
                    if (!remote) { return undefined; }
                    await requireRuntimeWorktree().pushTags(remote, {});
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            }
        }
    }

    private async handleGlobalToolbarCommand(command: ChangesToolbarCommand): Promise<boolean> {
        if (command === 'openGraph') {
            await vscode.commands.executeCommand('lookGit.graphView.focus');
            return true;
        }
        if (command === 'clone') {
            await vscode.commands.executeCommand('git.clone');
            return true;
        }
        if (command === 'showGitOutput') {
            await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
            return true;
        }
        return false;
    }

    private async openAllMergeEditors(repo: GitRepository): Promise<void> {
        const status = await repo.getStatus();
        await openAllThreeWayMergeEditors(repo, status.conflicts.filter((entry) => !entry.isSubmodule).map((entry) => entry.filePath));
    }

    private async openFirstMergeEditor(repo: GitRepository): Promise<void> {
        const status = await repo.getStatus();
        const conflict = status.conflicts.find((entry) => !entry.isSubmodule);
        if (!conflict) {
            await vscode.window.showInformationMessage('No conflicts to open.');
            return;
        }
        await openThreeWayMergeEditor(repo, conflict.filePath);
    }

    private async runTrackedToolbarOperation(
        command: ChangesToolbarCommand,
        operation: () => Promise<OperationStatus | undefined>,
    ): Promise<void> {
        const operationId = this.nextOperationId();
        this.postChangesOperation({
            operationId,
            status: OperationStatus.Running,
            command,
        });
        try {
            const status = await operation();
            this.postChangesOperation({
                operationId,
                status: status ?? OperationStatus.Success,
                command,
            });
        } catch (error) {
            this.postChangesOperation({
                operationId,
                status: OperationStatus.Failed,
                command,
            });
            throw error;
        }
    }

    private async runRepositoryMutationWithConflictNotice(
        repo: GitRepository,
        mutation: () => Promise<void>,
        conflictMessage: string,
    ): Promise<OperationStatus | undefined> {
        const existingConflicts = await conflictFileSet(repo);
        try {
            await mutation();
            await this.refreshAfterRepositoryUpdate();
            return await this.notifyNewConflicts(repo, existingConflicts, conflictMessage)
                ? OperationStatus.Conflict
                : undefined;
        } catch (error) {
            if (await this.refreshAndNotifyNewConflicts(repo, existingConflicts, conflictMessage)) { return OperationStatus.Conflict; }
            throw error;
        }
    }

    private async refreshAndNotifyNewConflicts(
        repo: GitRepository,
        existingConflicts: ReadonlySet<string>,
        message: string,
    ): Promise<boolean> {
        await this.refresh();
        const didNotify = await this.notifyNewConflicts(repo, existingConflicts, message);
        if (didNotify) {
            await this.onRepositoryUpdated();
        }
        return didNotify;
    }

    private async notifyNewConflicts(
        repo: GitRepository,
        existingConflicts: ReadonlySet<string>,
        message: string,
    ): Promise<boolean> {
        const status = await repo.getStatus();
        const conflictPaths = status.conflicts.map((entry) => entry.filePath);
        if (!hasNewConflicts(conflictPaths, existingConflicts)) { return false; }
        await notifyConflictsDetected(
            repo,
            message,
            conflictPaths,
            status.conflicts.filter((entry) => !entry.isSubmodule).map((entry) => entry.filePath),
        );
        return true;
    }

    private async refreshAfterRepositoryUpdate(): Promise<void> {
        await Promise.all([
            this.onRepositoryUpdated(),
            this.refresh(),
        ]);
    }

    private postChangesError(
        error: unknown,
        options: { readonly requestId?: RequestId; readonly operation: string; readonly code: ErrorCode },
    ): void {
        this.postMessage({
            type: 'changes/error',
            requestId: options.requestId,
            ...createErrorPayload(error, {
                code: options.code,
                operation: options.operation,
                recoverable: true,
            }),
        });
    }

    private postChangesOperation(operation: Omit<ChangesOperationStatusPush, 'type'>): void {
        this.postMessage({
            type: 'changes/operationStatus',
            ...operation,
            actions: operation.actions ?? operationActionsForStatus(operation.status),
        });
    }

    private nextOperationId(): string {
        this.operationSequence += 1;
        return `changes-op-${this.operationSequence}`;
    }

    private async requireKnownSubmodulePath(repo: GitRepository, requestedPath: string): Promise<string> {
        if (this.knownSubmodulePaths) {
            if (!this.knownSubmodulePaths.has(requestedPath)) {
                throw new Error(`Unknown submodule path: ${requestedPath}`);
            }
            return requestedPath;
        }
        const submodulePaths = await repo.getSubmodulePaths();
        this.knownSubmodulePaths = submodulePaths;
        if (!submodulePaths.has(requestedPath)) {
            throw new Error(`Unknown submodule path: ${requestedPath}`);
        }
        return requestedPath;
    }
}

async function updateChangesViewContexts(viewMode: ChangesViewPreference, sortMode: ChangesSortPreference | undefined): Promise<void> {
    const viewAsTree = viewMode === 'tree';
    await vscode.commands.executeCommand('setContext', 'lookGit.viewAsTree', viewAsTree);
    await vscode.commands.executeCommand('setContext', 'lookGit.changesViewAsTree', viewAsTree);
    await vscode.commands.executeCommand('setContext', 'lookGit.changesViewMode', viewMode);
    if (sortMode) {
        await vscode.commands.executeCommand('setContext', 'lookGit.changesSortMode', sortMode);
    }
}

function requestIdOf(msg: ChangesWebviewToExtensionMessage): RequestId | undefined {
    return 'requestId' in msg ? msg.requestId : undefined;
}

function errorCodeFor(msg: ChangesWebviewToExtensionMessage): ErrorCode {
    switch (msg.type) {
        case 'changes/openFile':
        case 'changes/openSubmodule':
        case 'changes/openMergeEditor':
        case 'changes/openFirstMergeEditor':
        case 'changes/openAllMergeEditors':
        case 'changes/openDiff':
        case 'changes/openSubmoduleDiff':
        case 'changes/submoduleOpenFile':
        case 'changes/submoduleOpenMergeEditor':
        case 'changes/submoduleOpenFirstMergeEditor':
        case 'changes/submoduleOpenAllMergeEditors':
        case 'changes/openSubmoduleStashDiff':
        case 'changes/openStashDiff':
            return 'vscodeCommandFailed';
        case 'changes/generateCommitMessage':
        case 'changes/generateSubmoduleCommitMessage':
            return 'languageModelFailed';
        case 'changes/commit':
        case 'changes/submoduleCommit':
            return 'gitOperationFailed';
        default:
            return 'gitOperationFailed';
    }
}

async function conflictFileSet(repo: GitRepository): Promise<ReadonlySet<string>> {
    try {
        const status = await repo.getStatus();
        return new Set(status.conflicts.map((entry) => entry.filePath));
    } catch {
        return new Set();
    }
}

function hasNewConflicts(conflictPaths: readonly string[], existingConflicts: ReadonlySet<string>): boolean {
    return conflictPaths.some((filePath) => !existingConflicts.has(filePath));
}

async function inputText(placeHolder: string, value?: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ placeHolder, value });
    const trimmed = input?.trim();
    return trimmed || undefined;
}

async function inputBranchName(placeHolder: string, value?: string): Promise<string | undefined> {
    return showBranchNameInput({ placeHolder, value });
}

async function pickBranch(placeHolder: string, runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const branches = await runtimeRepository.listBranches();
    return vscode.window.showQuickPick(branches.map((branch) => branch.name), { placeHolder });
}

async function pickRemoteBranch(placeHolder: string, runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const branches = (await runtimeRepository.listRemoteBranches())
        .filter((branch) => branch.isRemote)
        .map((branch) => branch.name);
    return vscode.window.showQuickPick(branches, { placeHolder });
}

function remoteBranchName(ref: string): { readonly remote: string; readonly branch: string } {
    const slashIdx = ref.indexOf('/');
    if (slashIdx === -1) { throw new Error(`Expected remote branch name, got "${ref}".`); }
    return {
        remote: ref.substring(0, slashIdx),
        branch: ref.substring(slashIdx + 1),
    };
}

async function currentBranchName(runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const branches = await runtimeRepository.listBranches();
    return branches.find((branch) => branch.isCurrent && !branch.isRemote)?.name;
}

async function pickLocalBranch(
    placeHolder: string,
    runtimeRepository: RuntimeGitRepository,
    preferred?: string,
): Promise<string | undefined> {
    const branches = (await runtimeRepository.listBranches())
        .filter((branch) => !branch.isRemote)
        .map((branch) => branch.name);
    const ordered = preferred && branches.includes(preferred)
        ? [preferred, ...branches.filter((branch) => branch !== preferred)]
        : branches;
    return vscode.window.showQuickPick(ordered, { placeHolder });
}

async function pickRemote(placeHolder: string, runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const remotes = await runtimeRepository.listRemotes();
    if (remotes.length === 1) { return remotes[0]; }
    return vscode.window.showQuickPick(remotes, { placeHolder });
}

async function pushCurrentBranchToPickedRemote(
    runtimeRepository: RuntimeGitRepository,
    worktree: Worktree,
    forceWithLease: boolean,
): Promise<void> {
    const branch = await currentBranchName(runtimeRepository);
    if (!branch || branch === 'HEAD') { throw new Error('No local branch is checked out.'); }
    const remote = await pickRemote('Push branch to remote', runtimeRepository);
    if (!remote) { return; }
    await worktree.pushBranch(remote, branch, { forceWithLease });
}

async function pickRef(placeHolder: string, runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const [branches, tags] = await Promise.all([
        runtimeRepository.listBranches(),
        runtimeRepository.listTags(),
    ]);
    return vscode.window.showQuickPick([
        ...branches.map((branch) => branch.name),
        ...tags.map((tag) => tag.name),
    ], { placeHolder });
}

async function pickTag(placeHolder: string, runtimeRepository: RuntimeGitRepository): Promise<string | undefined> {
    const tags = await runtimeRepository.listTags();
    return vscode.window.showQuickPick(tags.map((tag) => tag.name), { placeHolder });
}

async function pickStash(placeHolder: string, runtimeWorktree: Worktree): Promise<number | undefined> {
    const stashes = (await runtimeWorktree.listStashes({ limit: Number.MAX_SAFE_INTEGER })).items;
    const items = stashes.map((stash) => `stash@{${stash.index}} ${stash.message}`);
    const selected = await vscode.window.showQuickPick(items, { placeHolder });
    if (!selected) { return undefined; }
    const match = selected.match(/^stash@\{(\d+)\}/);
    return match?.[1] ? parseInt(match[1], 10) : undefined;
}

async function popRuntimeStashWithLocalChangesHint(worktree: Worktree, stash: string): Promise<void> {
    try {
        await worktree.popStash(stash, {});
    } catch (error) {
        if (!isLocalChangesWouldBeOverwrittenError(error)) { throw error; }
        throw Object.assign(new Error('Stash pop could not be applied because local changes would be overwritten. Commit, stash, or discard your local changes, then try again.'), {
            stderr: errorText(error),
        });
    }
}

function isLocalChangesWouldBeOverwrittenError(error: unknown): boolean {
    const text = errorText(error).toLowerCase();
    return text.includes('your local changes to the following files would be overwritten')
        || text.includes('please commit your changes or stash them before you merge')
        || text.includes('would be overwritten by merge');
}

function errorText(error: unknown): string {
    return [
        error instanceof Error ? error.message : String(error),
        stringProperty(error, 'stdout'),
        stringProperty(error, 'stderr'),
    ].filter((part) => part.length > 0).join('\n');
}

function stringProperty(error: unknown, propertyName: 'stdout' | 'stderr'): string {
    if (typeof error !== 'object' || error === null) { return ''; }
    const value = (error as Record<string, unknown>)[propertyName];
    return typeof value === 'string' ? value : '';
}

interface StatusDiffInput {
    readonly filePath: string;
    readonly origPath?: string;
    readonly isStaged: boolean;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
}

async function openStatusDiff(repo: GitRepository, msg: StatusDiffInput, runtimeTargets?: DiffRuntimeTargets): Promise<void> {
    const filePath = path.join(repo.cwd, msg.filePath);
    const fileUri = vscode.Uri.file(filePath);
    const baseName = path.basename(msg.filePath);
    const status = msg.isStaged ? msg.indexStatus : msg.workTreeStatus;
    const basePath = isRenameLikeStatus(status) ? msg.origPath ?? msg.filePath : msg.filePath;
    const baseRef = msg.isStaged ? 'HEAD' : ':';
    const emptyUri = readonlyContentUri(`${baseName} empty`, msg.filePath, '');

    let left: vscode.Uri;
    let right: vscode.Uri;
    let title: string;

    if (isAddedStatus(status)) {
        left = emptyUri;
        right = msg.isStaged
            ? await gitContentUri(msg.filePath, ':', `${baseName} index`, runtimeTargets)
            : fileUri;
        title = `${baseName} (Added)`;
    } else if (isDeletedStatus(status)) {
        left = await gitContentUri(basePath, baseRef, `${baseName} base`, runtimeTargets);
        right = emptyUri;
        title = `${baseName} (Deleted)`;
    } else {
        left = await gitContentUri(basePath, baseRef, `${baseName} base`, runtimeTargets);
        right = msg.isStaged
            ? await gitContentUri(msg.filePath, ':', `${baseName} index`, runtimeTargets)
            : fileUri;
        title = `${baseName} (${msg.isStaged ? 'Staged' : 'Working Tree'})`;
    }
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

async function openSubmoduleGitlinkDiff(repo: GitRepository, msg: StatusDiffInput): Promise<void> {
    await openStatusGitlinkDiff(repo, { filePath: msg.filePath, isStaged: msg.isStaged });
}

interface StashDiffInput {
    readonly filePath: string;
    readonly origPath?: string;
    readonly index: number;
    readonly status: string;
}

async function openStashDiff(msg: StashDiffInput, runtimeTargets?: DiffRuntimeTargets): Promise<void> {
    const emptyUri = readonlyContentUri(`${path.basename(msg.filePath)} empty`, msg.filePath, '');
    const stashRef = `stash@{${msg.index}}`;
    const basePath = isRenameLikeStatus(msg.status) ? msg.origPath ?? msg.filePath : msg.filePath;
    const left = isAddedStatus(msg.status)
        ? emptyUri
        : await gitContentUri(basePath, `${stashRef}^`, `${path.basename(basePath)} stash parent`, runtimeTargets);
    const right = isDeletedStatus(msg.status)
        ? emptyUri
        : await gitContentUriFromRefs(
            msg.filePath,
            isAddedStatus(msg.status) ? [stashRef, `${stashRef}^3`] : [stashRef],
            `${path.basename(msg.filePath)} stash`,
            runtimeTargets,
        );
    await vscode.commands.executeCommand(
        'vscode.diff',
        left,
        right,
        `${path.basename(msg.filePath)} (Stash ${msg.index})`,
    );
}

async function gitContentUri(
    filePath: string,
    ref: string,
    title: string,
    runtimeTargets?: DiffRuntimeTargets,
): Promise<vscode.Uri> {
    const content = await gitContent(filePath, ref, runtimeTargets);
    return readonlyContentUri(title, filePath, content);
}

async function gitContent(
    filePath: string,
    ref: string,
    runtimeTargets?: DiffRuntimeTargets,
): Promise<string> {
    if (ref === ':' && runtimeTargets?.worktree) {
        return runtimeTargets.worktree.getFileFromIndex(filePath);
    }
    if (ref !== ':' && runtimeTargets?.repository) {
        return runtimeTargets.repository.getFileAtRevision(filePath, ref);
    }
    throw new Error(`Runtime ${ref === ':' ? 'Worktree' : 'GitRepository'} is required to read "${filePath}".`);
}

async function gitContentUriFromRefs(
    filePath: string,
    refs: readonly string[],
    title: string,
    runtimeTargets?: DiffRuntimeTargets,
): Promise<vscode.Uri> {
    let lastError: unknown;
    for (const ref of refs) {
        try {
            return await gitContentUri(filePath, ref, title, runtimeTargets);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error(`Could not read ${filePath}.`);
}

function readonlyContentUri(title: string, filePath: string, content: string): vscode.Uri {
    return createReadonlyDocumentUri(title, content, documentExtension(filePath));
}

function documentExtension(filePath: string): string {
    const extension = path.extname(filePath).replace(/^\./, '');
    return extension || 'txt';
}

async function discardRuntimeFile(worktree: Worktree, filePath: string): Promise<void> {
    try {
        await worktree.discard([filePath]);
    } catch {
        await worktree.cleanUntracked([filePath], { force: true });
    }
}

function toStatusEntry(entry: GitStatusEntry): StatusEntry {
    return {
        indexStatus: entry.indexStatus,
        workTreeStatus: entry.workTreeStatus,
        filePath: entry.filePath,
        origPath: entry.origPath,
        isSubmodule: entry.isSubmodule,
    };
}

function isAddedStatus(status: string): boolean {
    return status === 'A' || status === '?';
}

function isDeletedStatus(status: string): boolean {
    return status === 'D';
}

function isRenameLikeStatus(status: string): boolean {
    return status === 'R' || status === 'C';
}

function stashRef(index: number): string {
    return `stash@{${index}}`;
}

export function buildStatusData(
    status: Awaited<ReturnType<GitRepository['getStatus']>>,
    stashes: Awaited<ReturnType<GitRepository['stashList']>>,
    submodules: readonly GitSubmodule[] = [],
    currentBranch?: string,
): { type: 'changes/statusData'; data: StatusData } {
    const dirtySubmodulePaths = new Set(
        [...status.staged, ...status.unstaged, ...status.conflicts]
            .filter((entry) => entry.isSubmodule)
            .map((entry) => entry.filePath),
    );
    const submoduleStatusByPath = new Map(submodules.map((submodule) => {
        const protocolStatus = toProtocolSubmoduleStatus(submodule.status);
        return [
            submodule.path,
            protocolStatus === SubmoduleStatus.Clean && dirtySubmodulePaths.has(submodule.path) ? SubmoduleStatus.Dirty : protocolStatus,
        ];
    }));
    const toEntry = (e: typeof status.staged[number]): StatusEntry => ({
        indexStatus: e.indexStatus,
        workTreeStatus: e.workTreeStatus,
        filePath: e.filePath,
        origPath: e.origPath,
        isSubmodule: e.isSubmodule,
        submoduleStatus: e.isSubmodule ? submoduleStatusByPath.get(e.filePath) : undefined,
    });

    return {
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Available,
            ...(currentBranch ? { currentBranch } : {}),
            staged: status.staged.map(toEntry),
            unstaged: status.unstaged.map(toEntry),
            conflicts: status.conflicts.map(toEntry),
            conflictState: toProtocolConflictState(status.conflictState),
            stashes: stashes.map((s) => ({ index: s.index, message: s.message })),
            submodules: submodules.map((s) => ({
                path: s.path,
                name: s.path.split('/').pop() ?? s.path,
                status: submoduleStatusByPath.get(s.path) ?? toProtocolSubmoduleStatus(s.status),
            })),
        },
    };
}

export function emptyStatusData(): { type: 'changes/statusData'; data: StatusData } {
    return {
        type: 'changes/statusData',
        data: {
            repositoryState: RepositoryState.Missing,
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: ConflictState.None,
            stashes: [],
            submodules: [],
        },
    };
}

function toProtocolConflictState(state: 'none' | 'merge' | 'rebase'): ConflictState {
    switch (state) {
        case 'merge': return ConflictState.Merge;
        case 'rebase': return ConflictState.Rebase;
        default: return ConflictState.None;
    }
}
