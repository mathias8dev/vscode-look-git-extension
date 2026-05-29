import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../core/git/GitRepository';
import type { ChangesWebviewToExtensionMessage, ChangesExtensionToWebviewMessage } from '../../protocol/changes/messages';
import type { StatusData, StatusEntry } from '../../protocol/changes/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { showModalWarningMessage } from '../utils/confirmation';
import { createErrorPayload } from './errorSerialization';

type PostMessage = (msg: ChangesExtensionToWebviewMessage) => void;
type RefreshCallback = () => Promise<void>;

export class ChangesMessageRouter {
    constructor(
        private readonly repositories: ActiveRepositoryAccessor,
        private readonly postMessage: PostMessage,
        private readonly refresh: RefreshCallback,
    ) {}

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
                await vscode.commands.executeCommand('setContext', 'lookGit.viewAsTree', msg.asTree);
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
                const choice = await showModalWarningMessage('Discard all changes? This cannot be undone.', 'Discard All');
                if (choice === 'Discard All') {
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
                        case 'amend':      await repo.commitAmend(message); break;
                        case 'commitPush': await repo.commit(message); await repo.push(); break;
                        case 'commitSync': await repo.commit(message); await repo.pullAndPush(); break;
                        default:           await repo.commit(message); break;
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

            case 'changes/openFile': {
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.open', uri);
                break;
            }

            case 'changes/openSubmodule': {
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.openFolder', uri);
                break;
            }

            case 'changes/openMergeEditor': {
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                try {
                    await vscode.commands.executeCommand('merge-conflict.accept.select', uri);
                } catch {
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
                break;
            }

            case 'changes/openDiff': {
                const cwd = repo.cwd;
                const filePath = path.join(cwd, msg.filePath);
                const origPath = msg.origPath ? path.join(cwd, msg.origPath) : filePath;
                const fileUri = vscode.Uri.file(filePath);
                const origUri = vscode.Uri.file(origPath);
                const emptyUri = vscode.Uri.parse(`lookgit-empty:${msg.filePath}`);
                const baseName = path.basename(msg.filePath);

                let left: vscode.Uri;
                let right: vscode.Uri;
                let title: string;

                if (msg.status === 'A') {
                    left = emptyUri; right = toGitUri(fileUri, ''); title = `${baseName} (Added)`;
                } else if (msg.status === 'D') {
                    left = toGitUri(origUri, 'HEAD'); right = emptyUri; title = `${baseName} (Deleted)`;
                } else if (msg.isStaged) {
                    left = toGitUri(origUri, 'HEAD'); right = toGitUri(fileUri, ''); title = `${baseName} (Staged)`;
                } else {
                    left = toGitUri(fileUri, '~'); right = fileUri; title = `${baseName} (Working Tree)`;
                }
                await vscode.commands.executeCommand('vscode.diff', left, right, title);
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
                const cwd = repo.cwd;
                const fileUri = vscode.Uri.file(path.join(cwd, msg.filePath));
                const stashRef = `stash@{${msg.index}}`;
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    toGitUri(fileUri, `${stashRef}^`),
                    toGitUri(fileUri, stashRef),
                    `${path.basename(msg.filePath)} (Stash ${msg.index})`,
                );
                break;
            }

            case 'changes/continueOp':
                if (msg.conflictState === 'merge') { await repo.mergeContinue(); }
                else { await repo.rebaseContinue(); }
                await this.refresh();
                break;

            case 'changes/abortOp': {
                const opName = msg.conflictState === 'merge' ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName}?`, 'Abort');
                if (choice === 'Abort') {
                    if (msg.conflictState === 'merge') { await repo.mergeAbort(); }
                    else { await repo.rebaseAbort(); }
                    await this.refresh();
                }
                break;
            }

            default:
                break;
        }
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
        case 'changes/openStashDiff':
            return 'vscodeCommandFailed';
        case 'changes/commit':
            return 'gitOperationFailed';
        default:
            return 'gitOperationFailed';
    }
}

function toGitUri(uri: vscode.Uri, ref: string): vscode.Uri {
    const query = JSON.stringify({ path: uri.path, ref });
    return uri.with({ scheme: 'git', query });
}

export function buildStatusData(
    status: Awaited<ReturnType<GitRepository['getStatus']>>,
    stashes: Awaited<ReturnType<GitRepository['stashList']>>,
): { type: 'changes/statusData'; data: StatusData } {
    const toEntry = (e: typeof status.staged[number]): StatusEntry => ({
        indexStatus: e.indexStatus,
        workTreeStatus: e.workTreeStatus,
        filePath: e.filePath,
        origPath: e.origPath,
        isSubmodule: e.isSubmodule,
    });

    return {
        type: 'changes/statusData',
        data: {
            repositoryState: 'available',
            staged: status.staged.map(toEntry),
            unstaged: status.unstaged.map(toEntry),
            conflicts: status.conflicts.map(toEntry),
            conflictState: status.conflictState,
            stashes: stashes.map((s) => ({ index: s.index, message: s.message })),
        },
    };
}

export function emptyStatusData(): { type: 'changes/statusData'; data: StatusData } {
    return {
        type: 'changes/statusData',
        data: {
            repositoryState: 'missing',
            staged: [],
            unstaged: [],
            conflicts: [],
            conflictState: 'none',
            stashes: [],
        },
    };
}
