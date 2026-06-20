import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
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
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { CliRemoteCommandKind, VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { confirmTypedPhrase, showModalWarningMessage } from '../utils/confirmation';
import { showBranchNameInput } from '../utils/branch-name-input';
import { createReadonlyDocumentUri } from '../utils/readonly-diff-documents';
import { openStatusGitlinkDiff } from '../utils/gitlink-diff';
import { toProtocolSubmoduleStatus, toRepositoryLocator, toWorktreeLocator } from '../mapping/toProtocol';
import { detectConflictStateFromFiles, parsePorcelainStatus } from '../../core/parsing/parseStatus';
import { parseNameStatusZ } from '../../core/parsing/parseNameStatus';
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
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
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
        const runtimeWorktree = this.currentRuntimeWorktree();

        switch (msg.type) {

            case 'changes/stageFile':
                if (runtimeWorktree) { await runtimeWorktree.stage([msg.filePath]); }
                else { await repo.stageFile(msg.filePath); }
                await this.refresh();
                break;

            case 'changes/stageFiles':
                if (runtimeWorktree) { await runtimeWorktree.stage(msg.filePaths); }
                else {
                    for (const filePath of msg.filePaths) {
                        await repo.stageFile(filePath);
                    }
                }
                await this.refresh();
                break;

            case 'changes/unstageFile':
                if (runtimeWorktree) { await runtimeWorktree.unstage([msg.filePath]); }
                else { await repo.unstageFile(msg.filePath); }
                await this.refresh();
                break;

            case 'changes/unstageFiles':
                if (runtimeWorktree) { await runtimeWorktree.unstage(msg.filePaths); }
                else {
                    for (const filePath of msg.filePaths) {
                        await repo.unstageFile(filePath);
                    }
                }
                await this.refresh();
                break;

            case 'changes/stageAll':
                if (runtimeWorktree) { await runtimeWorktree.stageAll(); }
                else { await repo.stageAll(); }
                await this.refresh();
                break;

            case 'changes/unstageAll':
                if (runtimeWorktree) { await runtimeWorktree.unstageAll(); }
                else { await repo.unstageAll(); }
                await this.refresh();
                break;

            case 'changes/discardFile': {
                const choice = await showModalWarningMessage(
                    `Discard changes to "${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    if (runtimeWorktree) { await runtimeWorktree.discard([msg.filePath]); }
                    else { await repo.discardFile(msg.filePath); }
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
                    if (runtimeWorktree) { await runtimeWorktree.discard(msg.filePaths); }
                    else {
                        for (const filePath of msg.filePaths) {
                            await repo.discardFile(filePath);
                        }
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/discardAll': {
                const confirmed = await confirmTypedPhrase('Discard all changes? This cannot be undone.', 'DISCARD ALL');
                if (confirmed) {
                    try {
                        if (runtimeWorktree) { await runtimeWorktree.unstageAll(); }
                        else { await repo.unstageAll(); }
                    } catch (error) {
                        this.postChangesError(error, {
                            operation: 'changes/discardAll:unstage',
                            code: 'gitOperationFailed',
                        });
                    }
                    const status = runtimeWorktree ? await runtimeWorktree.getStatus() : await repo.getStatus();
                    const paths = status.unstaged.map((entry) => entry.filePath);
                    if (runtimeWorktree) {
                        await runtimeWorktree.discard(paths);
                    } else {
                        for (const filePath of paths) {
                            await repo.discardFile(filePath);
                        }
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/markResolved':
                if (runtimeWorktree) { await runtimeWorktree.markResolved([msg.filePath]); }
                else { await repo.stageFile(msg.filePath); }
                await this.refresh();
                break;

            case 'changes/markResolvedFiles':
                if (runtimeWorktree) { await runtimeWorktree.markResolved(msg.filePaths); }
                else {
                    for (const filePath of msg.filePaths) {
                        await repo.stageFile(filePath);
                    }
                }
                await this.refresh();
                break;

            case 'changes/acceptOurs':
                if (runtimeWorktree) { await runtimeWorktree.acceptOurs([msg.filePath]); }
                else {
                    await repo.acceptOurs(msg.filePath);
                    await repo.stageFile(msg.filePath);
                }
                await this.refresh();
                break;

            case 'changes/acceptOursFiles':
                if (runtimeWorktree) { await runtimeWorktree.acceptOurs(msg.filePaths); }
                else {
                    for (const filePath of msg.filePaths) {
                        await repo.acceptOurs(filePath);
                        await repo.stageFile(filePath);
                    }
                }
                await this.refresh();
                break;

            case 'changes/acceptTheirs':
                if (runtimeWorktree) { await runtimeWorktree.acceptTheirs([msg.filePath]); }
                else {
                    await repo.acceptTheirs(msg.filePath);
                    await repo.stageFile(msg.filePath);
                }
                await this.refresh();
                break;

            case 'changes/acceptTheirsFiles':
                if (runtimeWorktree) { await runtimeWorktree.acceptTheirs(msg.filePaths); }
                else {
                    for (const filePath of msg.filePaths) {
                        await repo.acceptTheirs(filePath);
                        await repo.stageFile(filePath);
                    }
                }
                await this.refresh();
                break;

            case 'changes/acceptAllTheirs': {
                const choice = await showModalWarningMessage(
                    'Accept incoming changes for all conflicts?', 'Accept All Theirs',
                );
                if (choice !== 'Accept All Theirs') { break; }
                const status = runtimeWorktree ? await runtimeWorktree.getStatus() : await repo.getStatus();
                const conflictPaths = status.conflicts.map((entry) => entry.filePath);
                if (runtimeWorktree) { await runtimeWorktree.acceptTheirs(conflictPaths); }
                else {
                    for (const filePath of conflictPaths) {
                        await repo.acceptTheirs(filePath);
                        await repo.stageFile(filePath);
                    }
                }
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
                            if (runtimeWorktree) { await runtimeWorktree.amendCommit(message, {}); }
                            else { await repo.commitAmend(message); }
                            break;
                        case CommitMode.CommitPush:
                            if (runtimeWorktree) { await runtimeWorktree.commit(message, {}); }
                            else { await repo.commit(message); }
                            await this.remoteCommands.runVscode(repo, VscodeRemoteCommand.Push);
                            break;
                        case CommitMode.CommitSync:
                            if (runtimeWorktree) { await runtimeWorktree.commit(message, {}); }
                            else { await repo.commit(message); }
                            await this.remoteCommands.runVscode(repo, VscodeRemoteCommand.Sync);
                            break;
                        default:
                            if (runtimeWorktree) { await runtimeWorktree.commit(message, {}); }
                            else { await repo.commit(message); }
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
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                try {
                    switch (msg.mode) {
                        case CommitMode.Amend:
                            if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.amendCommit(message, {}); }
                            else { await repo.exec(['-C', submoduleCwd, 'commit', '--amend', '-m', message]); }
                            break;
                        case CommitMode.CommitPush:
                            if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.commit(message, {}); }
                            else { await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]); }
                            await this.remoteCommands.runCli(repo, {
                                kind: CliRemoteCommandKind.Args,
                                cwd: submoduleCwd,
                                args: ['push'],
                                title: `Look Git Remote: ${submodulePath}`,
                            });
                            break;
                        case CommitMode.CommitSync:
                            if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.commit(message, {}); }
                            else { await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]); }
                            await this.remoteCommands.runCli(repo, {
                                kind: CliRemoteCommandKind.CommandLine,
                                cwd: submoduleCwd,
                                commandLine: 'git pull --rebase && git push',
                                title: `Look Git Remote: ${submodulePath}`,
                            });
                            break;
                        default:
                            if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.commit(message, {}); }
                            else { await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]); }
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
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.stage([msg.filePath]); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleStageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.stage(msg.filePaths); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', ...msg.filePaths]); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.unstage([msg.filePath]); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', msg.filePath]); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.unstage(msg.filePaths); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', ...msg.filePaths]); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const choice = await showModalWarningMessage(
                    `Discard changes to "${submodulePath}/${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                    if (runtimeSubmoduleWorktree) { await discardRuntimeFile(runtimeSubmoduleWorktree, msg.filePath); }
                    else { await discardSubmoduleFile(repo, submodulePath, msg.filePath); }
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
                    const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                    if (runtimeSubmoduleWorktree) {
                        for (const filePath of msg.filePaths) {
                            await discardRuntimeFile(runtimeSubmoduleWorktree, filePath);
                        }
                    } else {
                        for (const filePath of msg.filePaths) {
                            await discardSubmoduleFile(repo, submodulePath, filePath);
                        }
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
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.markResolved([msg.filePath]); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptOurs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) {
                    await runtimeSubmoduleWorktree.acceptOurs([msg.filePath]);
                } else {
                    await repo.exec(['-C', submoduleCwd, 'checkout', '--ours', '--', msg.filePath]);
                    await repo.exec(['-C', submoduleCwd, 'add', '--', msg.filePath]);
                }
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptTheirs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) {
                    await runtimeSubmoduleWorktree.acceptTheirs([msg.filePath]);
                } else {
                    await repo.exec(['-C', submoduleCwd, 'checkout', '--theirs', '--', msg.filePath]);
                    await repo.exec(['-C', submoduleCwd, 'add', '--', msg.filePath]);
                }
                await this.refresh();
                break;
            }

            case 'changes/stash':
                if (runtimeWorktree) { await runtimeWorktree.stash(msg.message, {}); }
                else { await repo.stash(msg.message); }
                await this.refresh();
                break;

            case 'changes/stashStaged':
                if (runtimeWorktree) { await runtimeWorktree.stash(msg.message, { staged: true }); }
                else { await repo.stashStaged(msg.message); }
                await this.refresh();
                break;

            case 'changes/stashSelectedFiles': {
                if (msg.filePaths.length === 0) { break; }
                const message = msg.message?.trim();
                if (runtimeWorktree) {
                    await runtimeWorktree.stash(message, { includeUntracked: msg.includeUntracked, paths: msg.filePaths });
                } else {
                    const args = ['stash', 'push'];
                    if (msg.includeUntracked) { args.push('--include-untracked'); }
                    if (message) { args.push('-m', message); }
                    args.push('--', ...msg.filePaths);
                    await repo.exec(args);
                }
                await this.refresh();
                break;
            }

            case 'changes/stashPop':
                if (runtimeWorktree) { await runtimeWorktree.popStash(stashRef(msg.index), {}); }
                else { await repo.stashPop(msg.index); }
                await this.refresh();
                break;

            case 'changes/stashApply':
                if (runtimeWorktree) { await runtimeWorktree.applyStash(stashRef(msg.index), {}); }
                else { await repo.stashApply(msg.index); }
                await this.refresh();
                break;

            case 'changes/stashDrop': {
                const choice = await showModalWarningMessage('Drop this stash entry? This cannot be undone.', 'Drop');
                if (choice === 'Drop') {
                    if (runtimeWorktree) { await runtimeWorktree.dropStash(stashRef(msg.index)); }
                    else { await repo.stashDrop(msg.index); }
                    await this.refresh();
                }
                break;
            }

            case 'changes/getStashFiles': {
                const files = runtimeWorktree
                    ? await runtimeWorktree.getStashFiles(stashRef(msg.index))
                    : await repo.getStashFiles(msg.index);
                this.postMessage({
                    type: 'changes/stashFiles',
                    requestId: msg.requestId,
                    index: msg.index,
                    files: files.map((f) => ({ status: f.status, filePath: f.filePath, origPath: f.origPath })),
                });
                break;
            }

            case 'changes/openStashDiff': {
                await openStashDiff(repo, msg, { repository: this.currentRuntimeRepository() });
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
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                switch (msg.type) {
                    case 'changes/submoduleStash':
                        if (runtimeSubmoduleWorktree) {
                            await runtimeSubmoduleWorktree.stash(msg.message, {});
                        } else {
                            await repo.exec(msg.message
                                ? ['-C', submoduleCwd, 'stash', 'push', '-m', msg.message]
                                : ['-C', submoduleCwd, 'stash', 'push']);
                        }
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashSelectedFiles': {
                        if (msg.filePaths.length === 0) { break; }
                        const message = msg.message?.trim();
                        if (runtimeSubmoduleWorktree) {
                            await runtimeSubmoduleWorktree.stash(message, { includeUntracked: msg.includeUntracked, paths: msg.filePaths });
                        } else {
                            const args = ['-C', submoduleCwd, 'stash', 'push'];
                            if (msg.includeUntracked) { args.push('--include-untracked'); }
                            if (message) { args.push('-m', message); }
                            args.push('--', ...msg.filePaths);
                            await repo.exec(args);
                        }
                        await this.refresh();
                        break;
                    }
                    case 'changes/submoduleStashPop':
                        if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.popStash(stashRef(msg.index), {}); }
                        else { await repo.exec(['-C', submoduleCwd, 'stash', 'pop', `stash@{${msg.index}}`]); }
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashApply':
                        if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.applyStash(stashRef(msg.index), {}); }
                        else { await repo.exec(['-C', submoduleCwd, 'stash', 'apply', `stash@{${msg.index}}`]); }
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashDrop': {
                        const choice = await showModalWarningMessage('Drop this submodule stash entry? This cannot be undone.', 'Drop');
                        if (choice === 'Drop') {
                            if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.dropStash(stashRef(msg.index)); }
                            else { await repo.exec(['-C', submoduleCwd, 'stash', 'drop', `stash@{${msg.index}}`]); }
                            await this.refresh();
                        }
                        break;
                    }
                    case 'changes/getSubmoduleStashFiles': {
                        const files = runtimeSubmoduleWorktree
                            ? await runtimeSubmoduleWorktree.getStashFiles(stashRef(msg.index))
                            : parseNameStatusZ(await repo.execRaw([
                                '-C', submoduleCwd,
                                'stash', 'show', '--include-untracked', '--name-status', '-M', '-z',
                                `stash@{${msg.index}}`,
                            ]));
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
                            new ScopedGitRepository(repo, submodulePath),
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
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.stageAll(); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '-A']); }
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageAll': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.unstageAll(); }
                else { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD']); }
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
                    const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                    if (runtimeSubmoduleWorktree) {
                        const status = await runtimeSubmoduleWorktree.getStatus();
                        const stagedPaths = status.staged.map((entry) => entry.filePath);
                        if (stagedPaths.length > 0) { await runtimeSubmoduleWorktree.unstage(stagedPaths); }
                        for (const entry of status.unstaged) {
                            await discardRuntimeFile(runtimeSubmoduleWorktree, entry.filePath);
                        }
                    } else {
                        const raw = await repo.execRaw(['-C', path.join(repo.cwd, submodulePath), 'status', '--porcelain', '-z', '--untracked-files=all']);
                        const status = parsePorcelainStatus(raw);
                        for (const entry of status.staged) { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', entry.filePath]); }
                        for (const entry of status.unstaged) { await discardSubmoduleFile(repo, submodulePath, entry.filePath); }
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
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) {
                    const status = await runtimeSubmoduleWorktree.getStatus();
                    const conflictPaths = status.conflicts.map((entry) => entry.filePath);
                    await runtimeSubmoduleWorktree.acceptTheirs(conflictPaths);
                } else {
                    const raw = await repo.execRaw(['-C', submoduleCwd, 'status', '--porcelain', '-z', '--untracked-files=all']);
                    const status = parsePorcelainStatus(raw);
                    const conflictPaths = status.conflicts.map((entry) => entry.filePath);
                    for (const filePath of conflictPaths) {
                        await repo.exec(['-C', submoduleCwd, 'checkout', '--theirs', '--', filePath]);
                        await repo.exec(['-C', submoduleCwd, 'add', '--', filePath]);
                    }
                }
                await this.refresh();
                break;
            }

            case 'changes/getSubmoduleStatus': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.path);
                const subPath = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (runtimeSubmoduleWorktree) {
                    const [status, stashPage, currentBranch] = await Promise.all([
                        runtimeSubmoduleWorktree.getStatus(),
                        runtimeSubmoduleWorktree.listStashes({ limit: Number.MAX_SAFE_INTEGER }),
                        readCurrentBranch(repo, subPath),
                    ]);
                    this.postMessage({
                        type: 'changes/submoduleStatusData',
                        requestId: msg.requestId,
                        path: msg.path,
                        data: {
                            ...(currentBranch ? { currentBranch } : {}),
                            staged: status.staged.map(toStatusEntry),
                            unstaged: status.unstaged.map(toStatusEntry),
                            conflicts: status.conflicts.map(toStatusEntry),
                            conflictState: toProtocolConflictState(status.conflictState),
                            stashes: stashPage.items,
                        },
                    });
                    break;
                }
                const [raw, stashRaw, conflictState, currentBranch] = await Promise.all([
                    repo.execRaw(['--no-optional-locks', '-C', subPath, 'status', '--porcelain', '-z', '--untracked-files=all']),
                    repo.exec(['--no-optional-locks', '-C', subPath, 'stash', 'list', '--format=%gd %s']),
                    detectSubmoduleConflictState(repo, subPath),
                    readCurrentBranch(repo, subPath),
                ]);
                const { staged, unstaged, conflicts } = parsePorcelainStatus(raw);
                this.postMessage({
                    type: 'changes/submoduleStatusData',
                    requestId: msg.requestId,
                    path: msg.path,
                    data: {
                        ...(currentBranch ? { currentBranch } : {}),
                        staged: staged.map(toStatusEntry),
                        unstaged: unstaged.map(toStatusEntry),
                        conflicts: conflicts.map(toStatusEntry),
                        conflictState,
                        stashes: parseStashList(stashRaw),
                    },
                });
                break;
            }

            case 'changes/continueOp':
                if (msg.conflictState === ConflictState.Merge) {
                    if (runtimeWorktree) { await runtimeWorktree.continueMerge(); }
                    else { await repo.mergeContinue(); }
                } else {
                    if (runtimeWorktree) { await runtimeWorktree.continueRebase(); }
                    else { await repo.rebaseContinue(); }
                }
                await this.refresh();
                break;

            case 'changes/abortOp': {
                const opName = msg.conflictState === ConflictState.Merge ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName}?`, 'Abort');
                if (choice === 'Abort') {
                    if (msg.conflictState === ConflictState.Merge) {
                        if (runtimeWorktree) { await runtimeWorktree.abortMerge(); }
                        else { await repo.mergeAbort(); }
                    } else {
                        if (runtimeWorktree) { await runtimeWorktree.abortRebase(); }
                        else { await repo.rebaseAbort(); }
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleContinueOp': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                if (msg.conflictState === ConflictState.Merge) {
                    if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.continueMerge(); }
                    else { await repo.exec(['-C', submoduleCwd, '-c', 'core.editor=true', 'merge', '--continue']); }
                } else {
                    if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.continueRebase(); }
                    else { await repo.exec(['-C', submoduleCwd, '-c', 'core.editor=true', 'rebase', '--continue']); }
                }
                await this.refresh();
                break;
            }

            case 'changes/submoduleAbortOp': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const opName = msg.conflictState === ConflictState.Merge ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName} in "${submodulePath}"?`, 'Abort');
                if (choice === 'Abort') {
                    const submoduleCwd = path.join(repo.cwd, submodulePath);
                    const runtimeSubmoduleWorktree = this.runtimeSubmoduleWorktree(repo, submodulePath);
                    if (msg.conflictState === ConflictState.Merge) {
                        if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.abortMerge(); }
                        else { await repo.exec(['-C', submoduleCwd, 'merge', '--abort']); }
                    } else {
                        if (runtimeSubmoduleWorktree) { await runtimeSubmoduleWorktree.abortRebase(); }
                        else { await repo.exec(['-C', submoduleCwd, 'rebase', '--abort']); }
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
        switch (command) {
            case 'pull':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Pull, 'Pull stopped with conflicts.'));
                return;
            case 'push':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Push));
                return;
            case 'fetch':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Fetch));
                return;
            case 'fetchAll':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.FetchAll));
                return;
            case 'sync':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Sync, 'Sync stopped with conflicts.'));
                return;
            case 'pullRebase':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PullRebase, 'Pull with rebase stopped with conflicts.'));
                return;
            case 'pullFrom':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PullFrom, 'Pull from remote stopped with conflicts.'));
                return;
            case 'pushForce':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushForce));
                return;
            case 'pushTo':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushTo));
                return;
            case 'pushToForce':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushToForce));
                return;
            case 'fetchPrune':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.FetchPrune));
                return;
            case 'checkout': {
                const branch = await pickBranch(repo, 'Checkout branch', runtimeRepository);
                if (!branch) { return; }
                if (runtimeWorktree) { await runtimeWorktree.checkout(branch, {}); }
                else { await repo.checkout(branch); }
                await this.refresh();
                return;
            }
            case 'undoLastCommit': {
                const choice = await showModalWarningMessage('Undo the last commit and keep its changes staged?', 'Undo Commit');
                if (choice !== 'Undo Commit') { return; }
                if (runtimeWorktree) { await runtimeWorktree.undoLastCommit('soft'); }
                else { await repo.exec(['reset', '--soft', 'HEAD~1']); }
                await this.refresh();
                return;
            }
            case 'abortRebase': {
                const choice = await showModalWarningMessage('Abort the current rebase?', 'Abort Rebase');
                if (choice !== 'Abort Rebase') { return; }
                if (runtimeWorktree) { await runtimeWorktree.abortRebase(); }
                else { await repo.rebaseAbort(); }
                await this.refresh();
                return;
            }
            case 'mergeBranch': {
                const branch = await pickBranch(repo, 'Merge branch', runtimeRepository);
                if (!branch) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? runtimeWorktree.merge(branch, {}) : repo.merge(branch), 'Merge stopped with conflicts.'));
                return;
            }
            case 'rebaseBranch': {
                const branch = await pickBranch(repo, 'Rebase current branch onto', runtimeRepository);
                if (!branch) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? runtimeWorktree.rebase(branch, undefined, {}) : repo.rebase(branch), 'Rebase stopped with conflicts.'));
                return;
            }
            case 'createBranch': {
                const branch = await inputBranchName('Create branch');
                if (!branch) { return; }
                if (runtimeWorktree) { await runtimeWorktree.checkoutNewBranch(branch, undefined); }
                else { await repo.checkoutNewBranch(branch); }
                await this.refresh();
                return;
            }
            case 'createBranchFrom': {
                const branch = await inputBranchName('Create branch');
                if (!branch) { return; }
                const startPoint = await pickRef(repo, 'Create branch from', runtimeRepository);
                if (!startPoint) { return; }
                if (runtimeWorktree) { await runtimeWorktree.checkoutNewBranch(branch, startPoint); }
                else { await repo.checkoutNewBranch(branch, startPoint); }
                await this.refresh();
                return;
            }
            case 'renameBranch': {
                const current = await currentBranchName(repo, runtimeRepository);
                const oldName = await pickLocalBranch(repo, 'Rename branch', current, runtimeRepository);
                if (!oldName) { return; }
                const newName = await inputText('New branch name', oldName);
                if (!newName || newName === oldName) { return; }
                if (runtimeRepository) { await runtimeRepository.renameBranch(oldName, newName); }
                else { await repo.renameBranch(oldName, newName); }
                await this.refresh();
                return;
            }
            case 'deleteBranch': {
                const branch = await pickLocalBranch(repo, 'Delete branch', undefined, runtimeRepository);
                if (!branch) { return; }
                const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                if (runtimeRepository) { await runtimeRepository.deleteBranch(branch, false); }
                else { await repo.deleteBranch(branch); }
                await this.refresh();
                return;
            }
            case 'deleteRemoteBranch': {
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.DeleteRemoteBranch));
                return;
            }
            case 'publishBranch': {
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Publish));
                return;
            }
            case 'addRemote': {
                const name = await inputText('Remote name');
                if (!name) { return; }
                const url = await inputText('Remote URL');
                if (!url) { return; }
                if (runtimeRepository) { await runtimeRepository.addRemote(name, url); }
                else { await repo.exec(['remote', 'add', name, url]); }
                await this.refresh();
                return;
            }
            case 'removeRemote': {
                const remote = await pickRemote(repo, 'Remove remote', runtimeRepository);
                if (!remote) { return; }
                const choice = await showModalWarningMessage(`Remove remote "${remote}"?`, 'Remove');
                if (choice !== 'Remove') { return; }
                if (runtimeRepository) { await runtimeRepository.removeRemote(remote); }
                else { await repo.exec(['remote', 'remove', remote]); }
                await this.refresh();
                return;
            }
            case 'stash':
                await this.runTrackedToolbarOperation(command, async () => {
                    if (runtimeWorktree) { await runtimeWorktree.stash(undefined, {}); }
                    else { await repo.stash(); }
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'stashIncludeUntracked':
                await this.runTrackedToolbarOperation(command, async () => {
                    if (runtimeWorktree) { await runtimeWorktree.stash(undefined, { includeUntracked: true }); }
                    else { await repo.exec(['stash', 'push', '-u']); }
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'stashStaged':
                await this.runTrackedToolbarOperation(command, async () => {
                    if (runtimeWorktree) { await runtimeWorktree.stash(undefined, { staged: true }); }
                    else { await repo.stashStaged(); }
                    await this.refreshAfterRepositoryUpdate();
                    return undefined;
                });
                return;
            case 'applyLatestStash':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? runtimeWorktree.applyStash(stashRef(0), {}) : repo.stashApply(0), 'Apply stash stopped with conflicts.'));
                return;
            case 'applyStash': {
                const index = await pickStash(repo, 'Apply stash', runtimeWorktree);
                if (index === undefined) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? runtimeWorktree.applyStash(stashRef(index), {}) : repo.stashApply(index), 'Apply stash stopped with conflicts.'));
                return;
            }
            case 'popLatestStash':
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? popRuntimeStashWithLocalChangesHint(runtimeWorktree, stashRef(0)) : popStashWithLocalChangesHint(repo, 0), 'Pop stash stopped with conflicts.'));
                return;
            case 'popStash': {
                const index = await pickStash(repo, 'Pop stash', runtimeWorktree);
                if (index === undefined) { return; }
                await this.runTrackedToolbarOperation(command, () =>
                    this.runRepositoryMutationWithConflictNotice(repo, () => runtimeWorktree ? popRuntimeStashWithLocalChangesHint(runtimeWorktree, stashRef(index)) : popStashWithLocalChangesHint(repo, index), 'Pop stash stopped with conflicts.'));
                return;
            }
            case 'dropStash': {
                const index = await pickStash(repo, 'Drop stash', runtimeWorktree);
                if (index === undefined) { return; }
                const choice = await showModalWarningMessage(`Drop stash@{${index}}? This cannot be undone.`, 'Drop');
                if (choice !== 'Drop') { return; }
                if (runtimeWorktree) { await runtimeWorktree.dropStash(stashRef(index)); }
                else { await repo.stashDrop(index); }
                await this.refresh();
                return;
            }
            case 'dropAllStashes': {
                const confirmed = await confirmTypedPhrase('Drop all stashes? This cannot be undone.', 'DROP ALL STASHES');
                if (!confirmed) { return; }
                if (runtimeWorktree) {
                    await runtimeWorktree.clearStashes();
                } else {
                    const stashes = await repo.stashList();
                    for (const stash of stashes) {
                        await repo.stashDrop(stash.index);
                    }
                }
                await this.refresh();
                return;
            }
            case 'viewStash': {
                const index = await pickStash(repo, 'View stash', runtimeWorktree);
                if (index === undefined) { return; }
                const stash = stashRef(index);
                const content = runtimeWorktree
                    ? await runtimeWorktree.getStashSummary(stash)
                    : await repo.exec(['stash', 'show', '--stat', stash]);
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
                if (runtimeRepository) { await runtimeRepository.createTag(tag, 'HEAD', undefined); }
                else { await repo.exec(['tag', tag]); }
                await this.refresh();
                return;
            }
            case 'deleteTag': {
                const tag = await pickTag(repo, 'Delete tag', runtimeRepository);
                if (!tag) { return; }
                const choice = await showModalWarningMessage(`Delete tag "${tag}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                if (runtimeRepository) { await runtimeRepository.deleteTag(tag); }
                else { await repo.exec(['tag', '-d', tag]); }
                await this.refresh();
                return;
            }
            case 'deleteRemoteTag': {
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.DeleteRemoteTag));
                return;
            }
            case 'pushTags': {
                await this.runTrackedToolbarOperation(command, () =>
                    this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushTags));
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

    private async runVscodeRemoteToolbarCommand(
        repo: GitRepository,
        command: VscodeRemoteCommand,
        conflictMessage?: string,
    ): Promise<OperationStatus | undefined> {
        const existingConflicts = conflictMessage ? await conflictFileSet(repo) : undefined;
        try {
            await this.remoteCommands.runVscode(repo, command);
            await this.refreshAfterRepositoryUpdate();
            if (existingConflicts && conflictMessage) {
                return await this.notifyNewConflicts(repo, existingConflicts, conflictMessage)
                    ? OperationStatus.Conflict
                    : undefined;
            }
            return undefined;
        } catch (error) {
            if (existingConflicts && conflictMessage && await this.refreshAndNotifyNewConflicts(repo, existingConflicts, conflictMessage)) {
                return OperationStatus.Conflict;
            }
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

async function pickBranch(repo: GitRepository, placeHolder: string, runtimeRepository?: RuntimeGitRepository): Promise<string | undefined> {
    const branches = runtimeRepository ? await runtimeRepository.listBranches() : await repo.getAllBranches();
    return vscode.window.showQuickPick(branches.map((branch) => branch.name), { placeHolder });
}

async function currentBranchName(repo: GitRepository, runtimeRepository?: RuntimeGitRepository): Promise<string | undefined> {
    if (!runtimeRepository) { return repo.getCurrentBranch(); }
    const branches = await runtimeRepository.listBranches();
    return branches.find((branch) => branch.isCurrent && !branch.isRemote)?.name;
}

async function pickLocalBranch(
    repo: GitRepository,
    placeHolder: string,
    preferred?: string,
    runtimeRepository?: RuntimeGitRepository,
): Promise<string | undefined> {
    const branches = (runtimeRepository ? await runtimeRepository.listBranches() : await repo.getAllBranches())
        .filter((branch) => !branch.isRemote)
        .map((branch) => branch.name);
    const ordered = preferred && branches.includes(preferred)
        ? [preferred, ...branches.filter((branch) => branch !== preferred)]
        : branches;
    return vscode.window.showQuickPick(ordered, { placeHolder });
}

async function pickRemote(repo: GitRepository, placeHolder: string, runtimeRepository?: RuntimeGitRepository): Promise<string | undefined> {
    const remotes = runtimeRepository ? await runtimeRepository.listRemotes() : await repo.getRemotes();
    if (remotes.length === 1) { return remotes[0]; }
    return vscode.window.showQuickPick(remotes, { placeHolder });
}

async function pickRef(repo: GitRepository, placeHolder: string, runtimeRepository?: RuntimeGitRepository): Promise<string | undefined> {
    const [branches, tags] = await Promise.all([
        runtimeRepository ? runtimeRepository.listBranches() : repo.getAllBranches(),
        runtimeRepository ? runtimeRepository.listTags() : repo.getAllTags(),
    ]);
    return vscode.window.showQuickPick([
        ...branches.map((branch) => branch.name),
        ...tags.map((tag) => tag.name),
    ], { placeHolder });
}

async function pickTag(repo: GitRepository, placeHolder: string, runtimeRepository?: RuntimeGitRepository): Promise<string | undefined> {
    const tags = runtimeRepository ? await runtimeRepository.listTags() : await repo.getAllTags();
    return vscode.window.showQuickPick(tags.map((tag) => tag.name), { placeHolder });
}

async function pickStash(repo: GitRepository, placeHolder: string, runtimeWorktree?: Worktree): Promise<number | undefined> {
    const stashes = runtimeWorktree
        ? (await runtimeWorktree.listStashes({ limit: Number.MAX_SAFE_INTEGER })).items
        : await repo.stashList();
    const items = stashes.map((stash) => `stash@{${stash.index}} ${stash.message}`);
    const selected = await vscode.window.showQuickPick(items, { placeHolder });
    if (!selected) { return undefined; }
    const match = selected.match(/^stash@\{(\d+)\}/);
    return match?.[1] ? parseInt(match[1], 10) : undefined;
}

async function popStashWithLocalChangesHint(repo: GitRepository, index: number): Promise<void> {
    try {
        await repo.stashPop(index);
    } catch (error) {
        if (!isLocalChangesWouldBeOverwrittenError(error)) { throw error; }
        throw Object.assign(new Error('Stash pop could not be applied because local changes would be overwritten. Commit, stash, or discard your local changes, then try again.'), {
            stderr: errorText(error),
        });
    }
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
            ? await gitContentUri(repo, msg.filePath, ':', `${baseName} index`, runtimeTargets)
            : fileUri;
        title = `${baseName} (Added)`;
    } else if (isDeletedStatus(status)) {
        left = await gitContentUri(repo, basePath, baseRef, `${baseName} base`, runtimeTargets);
        right = emptyUri;
        title = `${baseName} (Deleted)`;
    } else {
        left = await gitContentUri(repo, basePath, baseRef, `${baseName} base`, runtimeTargets);
        right = msg.isStaged
            ? await gitContentUri(repo, msg.filePath, ':', `${baseName} index`, runtimeTargets)
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

async function openStashDiff(repo: GitRepository, msg: StashDiffInput, runtimeTargets?: DiffRuntimeTargets): Promise<void> {
    const emptyUri = readonlyContentUri(`${path.basename(msg.filePath)} empty`, msg.filePath, '');
    const stashRef = `stash@{${msg.index}}`;
    const basePath = isRenameLikeStatus(msg.status) ? msg.origPath ?? msg.filePath : msg.filePath;
    const left = isAddedStatus(msg.status)
        ? emptyUri
        : await gitContentUri(repo, basePath, `${stashRef}^`, `${path.basename(basePath)} stash parent`, runtimeTargets);
    const right = isDeletedStatus(msg.status)
        ? emptyUri
        : await gitContentUriFromRefs(
            repo,
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
    repo: GitRepository,
    filePath: string,
    ref: string,
    title: string,
    runtimeTargets?: DiffRuntimeTargets,
): Promise<vscode.Uri> {
    const content = await gitContent(repo, filePath, ref, runtimeTargets);
    return readonlyContentUri(title, filePath, content);
}

async function gitContent(
    repo: GitRepository,
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
    return repo.execRaw(['--no-optional-locks', 'show', `${ref}${ref.endsWith(':') ? '' : ':'}${filePath}`]);
}

async function gitContentUriFromRefs(
    repo: GitRepository,
    filePath: string,
    refs: readonly string[],
    title: string,
    runtimeTargets?: DiffRuntimeTargets,
): Promise<vscode.Uri> {
    let lastError: unknown;
    for (const ref of refs) {
        try {
            return await gitContentUri(repo, filePath, ref, title, runtimeTargets);
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

async function discardSubmoduleFile(repo: GitRepository, submodulePath: string, filePath: string): Promise<void> {
    const submoduleCwd = path.join(repo.cwd, submodulePath);
    try {
        await repo.exec(['-C', submoduleCwd, 'checkout', '--', filePath]);
    } catch {
        await repo.exec(['-C', submoduleCwd, 'clean', '-f', '--', filePath]);
    }
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

function parseStashList(output: string): readonly { readonly index: number; readonly message: string }[] {
    if (!output) { return []; }
    return output.split('\n').filter(Boolean).map((line) => {
        const match = line.match(/^stash@\{(\d+)\}\s+(.*)/);
        if (!match) { return { index: 0, message: line }; }
        return { index: parseInt(match[1] ?? '0', 10), message: match[2] ?? '' };
    });
}

async function detectSubmoduleConflictState(repo: GitRepository, submoduleCwd: string): Promise<ConflictState> {
    try {
        const gitDir = await repo.exec(['--no-optional-locks', '-C', submoduleCwd, 'rev-parse', '--git-dir']);
        const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(submoduleCwd, gitDir);
        return toProtocolConflictState(detectConflictStateFromFiles(await fs.readdir(absoluteGitDir)));
    } catch {
        return ConflictState.None;
    }
}

async function readCurrentBranch(repo: GitRepository, cwd: string): Promise<string | undefined> {
    try {
        const branch = await repo.exec(['--no-optional-locks', '-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD']);
        return branch || undefined;
    } catch {
        return undefined;
    }
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
