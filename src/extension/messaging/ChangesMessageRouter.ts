import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { GitRepository } from '../../application/ports/git-repository';
import type { GitSubmodule } from '../../core/git/domain/GitWorktree';
import type { ChangesSortPreference, ChangesToolbarCommand, ChangesViewPreference, ChangesWebviewToExtensionMessage, ChangesExtensionToWebviewMessage } from '../../protocol/changes/messages';
import { CommitMode, ConflictState, RepositoryState } from '../../protocol/changes/types';
import type { StatusData, StatusEntry } from '../../protocol/changes/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import { SubmoduleStatus } from '../../protocol/shared/repo';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { defaultRemoteCommandBackend } from '../git/hybrid-remote-command-backend';
import { CliRemoteCommandKind, VscodeRemoteCommand, type RemoteCommandBackend } from '../../application/ports/remote-command-backend';
import { confirmTypedPhrase, showModalWarningMessage } from '../utils/confirmation';
import { openReadonlyDiffDocument } from '../utils/readonly-diff-documents';
import { toProtocolSubmoduleStatus } from '../mapping/toProtocol';
import { detectConflictStateFromFiles, parsePorcelainStatus } from '../../core/parsing/parseStatus';
import { parseNameStatusZ } from '../../core/parsing/parseNameStatus';
import { GenerateCommitMessageUseCase } from '../../application/usecases/changes/generate-commit-message';
import { VscodeLanguageModelCommitMessageGenerator } from '../adapters/vscode/vscode-language-model-commit-message-generator';
import { ScopedGitRepository } from '../git/scoped-git-repository';
import { createErrorPayload, isAbortError } from './errorSerialization';

type PostMessage = (msg: ChangesExtensionToWebviewMessage) => void;
type RefreshCallback = () => Promise<void>;
type RepositoryUpdatedCallback = () => Promise<void>;

const OpenMergeEditorCommand = 'git.openMergeEditor';

export class ChangesMessageRouter {
    private knownSubmodulePaths: ReadonlySet<string> | undefined;
    private commitMessageGenerationAbortController: AbortController | undefined;
    private readonly submoduleCommitMessageGenerationAbortControllers = new Map<string, AbortController>();

    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly refresh: RefreshCallback,
        private readonly onRepositoryUpdated: RepositoryUpdatedCallback = async () => {},
        private readonly remoteCommands: RemoteCommandBackend = defaultRemoteCommandBackend,
        private readonly generateCommitMessage = new GenerateCommitMessageUseCase(new VscodeLanguageModelCommitMessageGenerator()),
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

        switch (msg.type) {

            case 'changes/stageFile':
                await repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/stageFiles':
                for (const filePath of msg.filePaths) {
                    await repo.stageFile(filePath);
                }
                await this.refresh();
                break;

            case 'changes/unstageFile':
                await repo.unstageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/unstageFiles':
                for (const filePath of msg.filePaths) {
                    await repo.unstageFile(filePath);
                }
                await this.refresh();
                break;

            case 'changes/stageAll':
                await repo.stageAll();
                await this.refresh();
                break;

            case 'changes/unstageAll':
                await repo.unstageAll();
                await this.refresh();
                break;

            case 'changes/discardFile': {
                const choice = await showModalWarningMessage(
                    `Discard changes to "${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await repo.discardFile(msg.filePath);
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
                        await repo.discardFile(filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/discardAll': {
                const confirmed = await confirmTypedPhrase('Discard all changes? This cannot be undone.', 'DISCARD ALL');
                if (confirmed) {
                    try {
                        await repo.unstageAll();
                    } catch (error) {
                        this.postChangesError(error, {
                            operation: 'changes/discardAll:unstage',
                            code: 'gitOperationFailed',
                        });
                    }
                    const status = await repo.getStatus();
                    for (const entry of status.unstaged) {
                        await repo.discardFile(entry.filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/markResolved':
                await repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/markResolvedFiles':
                for (const filePath of msg.filePaths) {
                    await repo.stageFile(filePath);
                }
                await this.refresh();
                break;

            case 'changes/acceptOurs':
                await repo.acceptOurs(msg.filePath);
                await repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/acceptOursFiles':
                for (const filePath of msg.filePaths) {
                    await repo.acceptOurs(filePath);
                    await repo.stageFile(filePath);
                }
                await this.refresh();
                break;

            case 'changes/acceptTheirs':
                await repo.acceptTheirs(msg.filePath);
                await repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/acceptTheirsFiles':
                for (const filePath of msg.filePaths) {
                    await repo.acceptTheirs(filePath);
                    await repo.stageFile(filePath);
                }
                await this.refresh();
                break;

            case 'changes/acceptAllTheirs': {
                const choice = await showModalWarningMessage(
                    'Accept incoming changes for all conflicts?', 'Accept All Theirs',
                );
                if (choice !== 'Accept All Theirs') { break; }
                const status = await repo.getStatus();
                for (const entry of status.conflicts) {
                    await repo.acceptTheirs(entry.filePath);
                    await repo.stageFile(entry.filePath);
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
                        case CommitMode.Amend:      await repo.commitAmend(message); break;
                        case CommitMode.CommitPush: await repo.commit(message); await this.remoteCommands.runVscode(repo, VscodeRemoteCommand.Push); break;
                        case CommitMode.CommitSync: await repo.commit(message); await this.remoteCommands.runVscode(repo, VscodeRemoteCommand.Sync); break;
                        default:                    await repo.commit(message); break;
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
                try {
                    switch (msg.mode) {
                        case CommitMode.Amend:
                            await repo.exec(['-C', submoduleCwd, 'commit', '--amend', '-m', message]);
                            break;
                        case CommitMode.CommitPush:
                            await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]);
                            await this.remoteCommands.runCli(repo, {
                                kind: CliRemoteCommandKind.Args,
                                cwd: submoduleCwd,
                                args: ['push'],
                                title: `Look Git Remote: ${submodulePath}`,
                            });
                            break;
                        case CommitMode.CommitSync:
                            await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]);
                            await this.remoteCommands.runCli(repo, {
                                kind: CliRemoteCommandKind.CommandLine,
                                cwd: submoduleCwd,
                                commandLine: 'git pull --rebase && git push',
                                title: `Look Git Remote: ${submodulePath}`,
                            });
                            break;
                        default:
                            await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]);
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
                await this.handleToolbarCommandForRepo(new ScopedGitRepository(repo, submodulePath), msg.command);
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
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                await openMergeEditor(uri);
                break;
            }

            case 'changes/openDiff': {
                if (msg.isSubmodule) {
                    await openSubmoduleGitlinkDiff(repo, msg);
                } else {
                    await openStatusDiff(repo.cwd, msg);
                }
                break;
            }

            case 'changes/openSubmoduleDiff': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await openStatusDiff(path.join(repo.cwd, submodulePath), msg);
                break;
            }

            case 'changes/submoduleOpenFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(repo.cwd, submodulePath, msg.filePath)));
                break;
            }

            case 'changes/submoduleStageFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleStageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', ...msg.filePaths]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFiles': {
                if (msg.filePaths.length === 0) { break; }
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', ...msg.filePaths]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardFile': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const choice = await showModalWarningMessage(
                    `Discard changes to "${submodulePath}/${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await discardSubmoduleFile(repo, submodulePath, msg.filePath);
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
                    for (const filePath of msg.filePaths) {
                        await discardSubmoduleFile(repo, submodulePath, filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleOpenMergeEditor': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const uri = vscode.Uri.file(path.join(repo.cwd, submodulePath, msg.filePath));
                await openMergeEditor(uri);
                break;
            }

            case 'changes/submoduleMarkResolved': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptOurs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                await repo.exec(['-C', submoduleCwd, 'checkout', '--ours', '--', msg.filePath]);
                await repo.exec(['-C', submoduleCwd, 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptTheirs': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                await repo.exec(['-C', submoduleCwd, 'checkout', '--theirs', '--', msg.filePath]);
                await repo.exec(['-C', submoduleCwd, 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/stash':
                await repo.stash(msg.message);
                await this.refresh();
                break;

            case 'changes/stashStaged':
                await repo.stashStaged(msg.message);
                await this.refresh();
                break;

            case 'changes/stashSelectedFiles': {
                if (msg.filePaths.length === 0) { break; }
                const args = ['stash', 'push'];
                if (msg.includeUntracked) { args.push('--include-untracked'); }
                const message = msg.message?.trim();
                if (message) { args.push('-m', message); }
                args.push('--', ...msg.filePaths);
                await repo.exec(args);
                await this.refresh();
                break;
            }

            case 'changes/stashPop':
                await repo.stashPop(msg.index);
                await this.refresh();
                break;

            case 'changes/stashApply':
                await repo.stashApply(msg.index);
                await this.refresh();
                break;

            case 'changes/stashDrop': {
                const choice = await showModalWarningMessage('Drop this stash entry? This cannot be undone.', 'Drop');
                if (choice === 'Drop') {
                    await repo.stashDrop(msg.index);
                    await this.refresh();
                }
                break;
            }

            case 'changes/getStashFiles': {
                const files = await repo.getStashFiles(msg.index);
                this.postMessage({
                    type: 'changes/stashFiles',
                    requestId: msg.requestId,
                    index: msg.index,
                    files: files.map((f) => ({ status: f.status, filePath: f.filePath, origPath: f.origPath })),
                });
                break;
            }

            case 'changes/openStashDiff': {
                await openStashDiff(repo.cwd, msg);
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
                switch (msg.type) {
                    case 'changes/submoduleStash':
                        await repo.exec(msg.message
                            ? ['-C', submoduleCwd, 'stash', 'push', '-m', msg.message]
                            : ['-C', submoduleCwd, 'stash', 'push']);
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashSelectedFiles': {
                        if (msg.filePaths.length === 0) { break; }
                        const args = ['-C', submoduleCwd, 'stash', 'push'];
                        if (msg.includeUntracked) { args.push('--include-untracked'); }
                        const message = msg.message?.trim();
                        if (message) { args.push('-m', message); }
                        args.push('--', ...msg.filePaths);
                        await repo.exec(args);
                        await this.refresh();
                        break;
                    }
                    case 'changes/submoduleStashPop':
                        await repo.exec(['-C', submoduleCwd, 'stash', 'pop', `stash@{${msg.index}}`]);
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashApply':
                        await repo.exec(['-C', submoduleCwd, 'stash', 'apply', `stash@{${msg.index}}`]);
                        await this.refresh();
                        break;
                    case 'changes/submoduleStashDrop': {
                        const choice = await showModalWarningMessage('Drop this submodule stash entry? This cannot be undone.', 'Drop');
                        if (choice === 'Drop') {
                            await repo.exec(['-C', submoduleCwd, 'stash', 'drop', `stash@{${msg.index}}`]);
                            await this.refresh();
                        }
                        break;
                    }
                    case 'changes/getSubmoduleStashFiles': {
                        const raw = await repo.execRaw(['-C', submoduleCwd, 'stash', 'show', '--include-untracked', '--name-status', '-M', '-z', `stash@{${msg.index}}`]);
                        const files = raw ? parseNameStatusZ(raw) : [];
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
                        await openStashDiff(submoduleCwd, msg);
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
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '-A']);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageAll': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD']);
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
                    const raw = await repo.execRaw(['-C', path.join(repo.cwd, submodulePath), 'status', '--porcelain', '-z', '--untracked-files=all']);
                    const status = parsePorcelainStatus(raw);
                    for (const entry of status.staged) { await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', entry.filePath]); }
                    for (const entry of status.unstaged) { await discardSubmoduleFile(repo, submodulePath, entry.filePath); }
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
                const raw = await repo.execRaw(['-C', submoduleCwd, 'status', '--porcelain', '-z', '--untracked-files=all']);
                const status = parsePorcelainStatus(raw);
                for (const entry of status.conflicts) {
                    await repo.exec(['-C', submoduleCwd, 'checkout', '--theirs', '--', entry.filePath]);
                    await repo.exec(['-C', submoduleCwd, 'add', '--', entry.filePath]);
                }
                await this.refresh();
                break;
            }

            case 'changes/getSubmoduleStatus': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.path);
                const subPath = path.join(repo.cwd, submodulePath);
                const [raw, stashRaw, conflictState, currentBranch] = await Promise.all([
                    repo.execRaw(['--no-optional-locks', '-C', subPath, 'status', '--porcelain', '-z', '--untracked-files=all']),
                    repo.exec(['--no-optional-locks', '-C', subPath, 'stash', 'list', '--format=%gd %s']),
                    detectSubmoduleConflictState(repo, subPath),
                    readCurrentBranch(repo, subPath),
                ]);
                const { staged, unstaged, conflicts } = parsePorcelainStatus(raw);
                const toEntry = (e: typeof staged[number]): StatusEntry => ({
                    indexStatus: e.indexStatus,
                    workTreeStatus: e.workTreeStatus,
                    filePath: e.filePath,
                    origPath: e.origPath,
                    isSubmodule: e.isSubmodule,
                });
                this.postMessage({
                    type: 'changes/submoduleStatusData',
                    requestId: msg.requestId,
                    path: msg.path,
                    data: {
                        ...(currentBranch ? { currentBranch } : {}),
                        staged: staged.map(toEntry),
                        unstaged: unstaged.map(toEntry),
                        conflicts: conflicts.map(toEntry),
                        conflictState,
                        stashes: parseStashList(stashRaw),
                    },
                });
                break;
            }

            case 'changes/continueOp':
                if (msg.conflictState === ConflictState.Merge) { await repo.mergeContinue(); }
                else { await repo.rebaseContinue(); }
                await this.refresh();
                break;

            case 'changes/abortOp': {
                const opName = msg.conflictState === ConflictState.Merge ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName}?`, 'Abort');
                if (choice === 'Abort') {
                    if (msg.conflictState === ConflictState.Merge) { await repo.mergeAbort(); }
                    else { await repo.rebaseAbort(); }
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleContinueOp': {
                const submodulePath = await this.requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                if (msg.conflictState === ConflictState.Merge) {
                    await repo.exec(['-C', submoduleCwd, '-c', 'core.editor=true', 'merge', '--continue']);
                } else {
                    await repo.exec(['-C', submoduleCwd, '-c', 'core.editor=true', 'rebase', '--continue']);
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
                    if (msg.conflictState === ConflictState.Merge) {
                        await repo.exec(['-C', submoduleCwd, 'merge', '--abort']);
                    } else {
                        await repo.exec(['-C', submoduleCwd, 'rebase', '--abort']);
                    }
                    await this.refresh();
                }
                break;
            }

            default:
                break;
        }
    }

    async handleToolbarCommand(command: ChangesToolbarCommand): Promise<void> {
        if (await this.handleGlobalToolbarCommand(command)) { return; }
        await this.handleToolbarCommandForRepo(this.repositories.requireRepository(), command);
    }

    async handleToolbarCommandForRepo(repo: GitRepository, command: ChangesToolbarCommand): Promise<void> {
        if (await this.handleGlobalToolbarCommand(command)) { return; }
        switch (command) {
            case 'pull':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Pull);
                return;
            case 'push':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Push);
                return;
            case 'fetch':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Fetch);
                return;
            case 'fetchAll':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.FetchAll);
                return;
            case 'sync':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Sync);
                return;
            case 'pullRebase':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PullRebase);
                return;
            case 'pullFrom':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PullFrom);
                return;
            case 'pushForce':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushForce);
                return;
            case 'pushTo':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushTo);
                return;
            case 'pushToForce':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushToForce);
                return;
            case 'fetchPrune':
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.FetchPrune);
                return;
            case 'checkout': {
                const branch = await pickBranch(repo, 'Checkout branch');
                if (!branch) { return; }
                await repo.checkout(branch);
                await this.refresh();
                return;
            }
            case 'undoLastCommit': {
                const choice = await showModalWarningMessage('Undo the last commit and keep its changes staged?', 'Undo Commit');
                if (choice !== 'Undo Commit') { return; }
                await repo.exec(['reset', '--soft', 'HEAD~1']);
                await this.refresh();
                return;
            }
            case 'abortRebase': {
                const choice = await showModalWarningMessage('Abort the current rebase?', 'Abort Rebase');
                if (choice !== 'Abort Rebase') { return; }
                await repo.rebaseAbort();
                await this.refresh();
                return;
            }
            case 'mergeBranch': {
                const branch = await pickBranch(repo, 'Merge branch');
                if (!branch) { return; }
                await repo.merge(branch);
                await this.refresh();
                return;
            }
            case 'rebaseBranch': {
                const branch = await pickBranch(repo, 'Rebase current branch onto');
                if (!branch) { return; }
                await repo.rebase(branch);
                await this.refresh();
                return;
            }
            case 'createBranch': {
                const branch = await inputText('Create branch');
                if (!branch) { return; }
                await repo.checkoutNewBranch(branch);
                await this.refresh();
                return;
            }
            case 'createBranchFrom': {
                const branch = await inputText('Create branch');
                if (!branch) { return; }
                const startPoint = await pickRef(repo, 'Create branch from');
                if (!startPoint) { return; }
                await repo.checkoutNewBranch(branch, startPoint);
                await this.refresh();
                return;
            }
            case 'renameBranch': {
                const current = await repo.getCurrentBranch();
                const oldName = await pickLocalBranch(repo, 'Rename branch', current);
                if (!oldName) { return; }
                const newName = await inputText('New branch name', oldName);
                if (!newName || newName === oldName) { return; }
                await repo.renameBranch(oldName, newName);
                await this.refresh();
                return;
            }
            case 'deleteBranch': {
                const branch = await pickLocalBranch(repo, 'Delete branch');
                if (!branch) { return; }
                const choice = await showModalWarningMessage(`Delete branch "${branch}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                await repo.deleteBranch(branch);
                await this.refresh();
                return;
            }
            case 'deleteRemoteBranch': {
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.DeleteRemoteBranch);
                return;
            }
            case 'publishBranch': {
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.Publish);
                return;
            }
            case 'addRemote': {
                const name = await inputText('Remote name');
                if (!name) { return; }
                const url = await inputText('Remote URL');
                if (!url) { return; }
                await repo.exec(['remote', 'add', name, url]);
                await this.refresh();
                return;
            }
            case 'removeRemote': {
                const remote = await pickRemote(repo, 'Remove remote');
                if (!remote) { return; }
                const choice = await showModalWarningMessage(`Remove remote "${remote}"?`, 'Remove');
                if (choice !== 'Remove') { return; }
                await repo.exec(['remote', 'remove', remote]);
                await this.refresh();
                return;
            }
            case 'stash':
                await repo.stash();
                await this.refresh();
                return;
            case 'stashIncludeUntracked':
                await repo.exec(['stash', 'push', '-u']);
                await this.refresh();
                return;
            case 'stashStaged':
                await repo.stashStaged();
                await this.refresh();
                return;
            case 'applyLatestStash':
                await repo.stashApply(0);
                await this.refresh();
                return;
            case 'applyStash': {
                const index = await pickStash(repo, 'Apply stash');
                if (index === undefined) { return; }
                await repo.stashApply(index);
                await this.refresh();
                return;
            }
            case 'popLatestStash':
                await repo.stashPop(0);
                await this.refresh();
                return;
            case 'popStash': {
                const index = await pickStash(repo, 'Pop stash');
                if (index === undefined) { return; }
                await repo.stashPop(index);
                await this.refresh();
                return;
            }
            case 'dropStash': {
                const index = await pickStash(repo, 'Drop stash');
                if (index === undefined) { return; }
                const choice = await showModalWarningMessage(`Drop stash@{${index}}? This cannot be undone.`, 'Drop');
                if (choice !== 'Drop') { return; }
                await repo.stashDrop(index);
                await this.refresh();
                return;
            }
            case 'dropAllStashes': {
                const confirmed = await confirmTypedPhrase('Drop all stashes? This cannot be undone.', 'DROP ALL STASHES');
                if (!confirmed) { return; }
                const stashes = await repo.stashList();
                for (const stash of stashes) {
                    await repo.stashDrop(stash.index);
                }
                await this.refresh();
                return;
            }
            case 'viewStash': {
                const index = await pickStash(repo, 'View stash');
                if (index === undefined) { return; }
                const content = await repo.exec(['stash', 'show', '--stat', `stash@{${index}}`]);
                const document = await vscode.workspace.openTextDocument({
                    content: content || `stash@{${index}}`,
                    language: 'plaintext',
                });
                await vscode.window.showTextDocument(document);
                return;
            }
            case 'createTag': {
                const tag = await inputText('Create tag');
                if (!tag) { return; }
                await repo.exec(['tag', tag]);
                await this.refresh();
                return;
            }
            case 'deleteTag': {
                const tag = await pickTag(repo, 'Delete tag');
                if (!tag) { return; }
                const choice = await showModalWarningMessage(`Delete tag "${tag}"?`, 'Delete');
                if (choice !== 'Delete') { return; }
                await repo.exec(['tag', '-d', tag]);
                await this.refresh();
                return;
            }
            case 'deleteRemoteTag': {
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.DeleteRemoteTag);
                return;
            }
            case 'pushTags': {
                await this.runVscodeRemoteToolbarCommand(repo, VscodeRemoteCommand.PushTags);
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

    private async runVscodeRemoteToolbarCommand(repo: GitRepository, command: VscodeRemoteCommand): Promise<void> {
        await this.remoteCommands.runVscode(repo, command);
        await this.refreshAfterRepositoryUpdate();
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
        case 'changes/openDiff':
        case 'changes/openSubmoduleDiff':
        case 'changes/submoduleOpenFile':
        case 'changes/submoduleOpenMergeEditor':
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

async function inputText(placeHolder: string, value?: string): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ placeHolder, value });
    const trimmed = input?.trim();
    return trimmed || undefined;
}

async function pickBranch(repo: GitRepository, placeHolder: string): Promise<string | undefined> {
    const branches = await repo.getAllBranches();
    return vscode.window.showQuickPick(branches.map((branch) => branch.name), { placeHolder });
}

async function pickLocalBranch(repo: GitRepository, placeHolder: string, preferred?: string): Promise<string | undefined> {
    const branches = (await repo.getAllBranches())
        .filter((branch) => !branch.isRemote)
        .map((branch) => branch.name);
    const ordered = preferred && branches.includes(preferred)
        ? [preferred, ...branches.filter((branch) => branch !== preferred)]
        : branches;
    return vscode.window.showQuickPick(ordered, { placeHolder });
}

async function pickRemote(repo: GitRepository, placeHolder: string): Promise<string | undefined> {
    const remotes = await repo.getRemotes();
    if (remotes.length === 1) { return remotes[0]; }
    return vscode.window.showQuickPick(remotes, { placeHolder });
}

async function pickRef(repo: GitRepository, placeHolder: string): Promise<string | undefined> {
    const [branches, tags] = await Promise.all([
        repo.getAllBranches(),
        repo.getAllTags(),
    ]);
    return vscode.window.showQuickPick([
        ...branches.map((branch) => branch.name),
        ...tags.map((tag) => tag.name),
    ], { placeHolder });
}

async function pickTag(repo: GitRepository, placeHolder: string): Promise<string | undefined> {
    const tags = await repo.getAllTags();
    return vscode.window.showQuickPick(tags.map((tag) => tag.name), { placeHolder });
}

async function pickStash(repo: GitRepository, placeHolder: string): Promise<number | undefined> {
    const stashes = await repo.stashList();
    const items = stashes.map((stash) => `stash@{${stash.index}} ${stash.message}`);
    const selected = await vscode.window.showQuickPick(items, { placeHolder });
    if (!selected) { return undefined; }
    const match = selected.match(/^stash@\{(\d+)\}/);
    return match?.[1] ? parseInt(match[1], 10) : undefined;
}

interface StatusDiffInput {
    readonly filePath: string;
    readonly origPath?: string;
    readonly isStaged: boolean;
    readonly indexStatus: string;
    readonly workTreeStatus: string;
}

async function openStatusDiff(cwd: string, msg: StatusDiffInput): Promise<void> {
    const filePath = path.join(cwd, msg.filePath);
    const origPath = msg.origPath ? path.join(cwd, msg.origPath) : filePath;
    const fileUri = vscode.Uri.file(filePath);
    const origUri = vscode.Uri.file(origPath);
    const emptyUri = vscode.Uri.parse(`lookgit-empty:${msg.filePath}`);
    const baseName = path.basename(msg.filePath);
    const status = msg.isStaged ? msg.indexStatus : msg.workTreeStatus;
    const baseUri = isRenameLikeStatus(status) ? origUri : fileUri;
    const baseRef = msg.isStaged ? 'HEAD' : '~';
    const modifiedUri = msg.isStaged ? toGitUri(fileUri, '') : fileUri;

    let left: vscode.Uri;
    let right: vscode.Uri;
    let title: string;

    if (isAddedStatus(status)) {
        left = emptyUri; right = modifiedUri; title = `${baseName} (Added)`;
    } else if (isDeletedStatus(status)) {
        left = toGitUri(baseUri, baseRef); right = emptyUri; title = `${baseName} (Deleted)`;
    } else {
        left = toGitUri(baseUri, baseRef); right = modifiedUri; title = `${baseName} (${msg.isStaged ? 'Staged' : 'Working Tree'})`;
    }
    await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

async function openSubmoduleGitlinkDiff(repo: GitRepository, msg: StatusDiffInput): Promise<void> {
    const args = [
        'diff',
        '--submodule=short',
        ...(msg.isStaged ? ['--cached'] : []),
        '--',
        msg.filePath,
    ];
    const diff = await repo.execRaw(args);
    const content = diff.trimEnd() || `No submodule gitlink changes for ${msg.filePath}.\n`;
    await openReadonlyDiffDocument(`${path.basename(msg.filePath)} submodule gitlink`, content);
}

interface StashDiffInput {
    readonly filePath: string;
    readonly origPath?: string;
    readonly index: number;
    readonly status: string;
}

async function openStashDiff(cwd: string, msg: StashDiffInput): Promise<void> {
    const fileUri = vscode.Uri.file(path.join(cwd, msg.filePath));
    const origUri = vscode.Uri.file(path.join(cwd, msg.origPath ?? msg.filePath));
    const emptyUri = vscode.Uri.parse(`lookgit-empty:${msg.filePath}`);
    const stashRef = `stash@{${msg.index}}`;
    const baseUri = isRenameLikeStatus(msg.status) ? origUri : fileUri;
    const left = isAddedStatus(msg.status) ? emptyUri : toGitUri(baseUri, `${stashRef}^`);
    const right = isDeletedStatus(msg.status) ? emptyUri : toGitUri(fileUri, stashRef);
    await vscode.commands.executeCommand(
        'vscode.diff',
        left,
        right,
        `${path.basename(msg.filePath)} (Stash ${msg.index})`,
    );
}

async function discardSubmoduleFile(repo: GitRepository, submodulePath: string, filePath: string): Promise<void> {
    const submoduleCwd = path.join(repo.cwd, submodulePath);
    try {
        await repo.exec(['-C', submoduleCwd, 'checkout', '--', filePath]);
    } catch {
        await repo.exec(['-C', submoduleCwd, 'clean', '-f', '--', filePath]);
    }
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

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    const query = JSON.stringify({ path: uri.path, ref });
    return uri.with({ scheme: 'git', query });
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

async function openMergeEditor(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand(OpenMergeEditorCommand, uri);
}
