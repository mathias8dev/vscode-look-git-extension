import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../core/git/GitRepository';
import type { GitSubmodule } from '../../core/git/domain/GitWorktree';
import type { ChangesWebviewToExtensionMessage, ChangesExtensionToWebviewMessage } from '../../protocol/changes/messages';
import { CommitMode, ConflictState, RepositoryState } from '../../protocol/changes/types';
import type { StatusData, StatusEntry } from '../../protocol/changes/types';
import type { ErrorCode, RequestId } from '../../protocol/shared/base';
import { SubmoduleStatus } from '../../protocol/shared/repo';
import type { ActiveRepositoryAccessor } from '../repositories/ActiveRepositoryRegistry';
import { confirmTypedPhrase, showModalWarningMessage } from '../utils/confirmation';
import { toProtocolSubmoduleStatus } from '../mapping/toProtocol';
import { parsePorcelainStatus } from '../../core/parsing/parseStatus';
import { parseNameStatusZ } from '../../core/parsing/parseNameStatus';
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
                        case CommitMode.CommitPush: await repo.commit(message); await repo.push(); break;
                        case CommitMode.CommitSync: await repo.commit(message); await repo.pullAndPush(); break;
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

            case 'changes/submoduleCommit': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
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
                            await repo.exec(['-C', submoduleCwd, 'push']);
                            break;
                        case CommitMode.CommitSync:
                            await repo.exec(['-C', submoduleCwd, 'commit', '-m', message]);
                            await repo.exec(['-C', submoduleCwd, 'pull', '--rebase']);
                            await repo.exec(['-C', submoduleCwd, 'push']);
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

            case 'changes/openFile': {
                const uri = vscode.Uri.file(path.join(repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.open', uri);
                break;
            }

            case 'changes/openSubmodule': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.filePath);
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
                try {
                    await vscode.commands.executeCommand('merge-conflict.accept.select', uri);
                } catch {
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
                break;
            }

            case 'changes/openDiff': {
                await openStatusDiff(repo.cwd, msg);
                break;
            }

            case 'changes/openSubmoduleDiff': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await openStatusDiff(path.join(repo.cwd, submodulePath), msg);
                break;
            }

            case 'changes/submoduleOpenFile': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path.join(repo.cwd, submodulePath, msg.filePath)));
                break;
            }

            case 'changes/submoduleStageFile': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageFile': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardFile': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                const choice = await showModalWarningMessage(
                    `Discard changes to "${submodulePath}/${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await discardSubmoduleFile(repo, submodulePath, msg.filePath);
                    await this.refresh();
                }
                break;
            }

            case 'changes/submoduleOpenMergeEditor': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                const uri = vscode.Uri.file(path.join(repo.cwd, submodulePath, msg.filePath));
                try {
                    await vscode.commands.executeCommand('merge-conflict.accept.select', uri);
                } catch {
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
                break;
            }

            case 'changes/submoduleMarkResolved': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptOurs': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                await repo.exec(['-C', submoduleCwd, 'checkout', '--ours', '--', msg.filePath]);
                await repo.exec(['-C', submoduleCwd, 'add', '--', msg.filePath]);
                await this.refresh();
                break;
            }

            case 'changes/submoduleAcceptTheirs': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
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
            case 'changes/submoduleStashPop':
            case 'changes/submoduleStashApply':
            case 'changes/submoduleStashDrop':
            case 'changes/getSubmoduleStashFiles':
            case 'changes/openSubmoduleStashDiff': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                const submoduleCwd = path.join(repo.cwd, submodulePath);
                switch (msg.type) {
                    case 'changes/submoduleStash':
                        await repo.exec(msg.message
                            ? ['-C', submoduleCwd, 'stash', 'push', '-m', msg.message]
                            : ['-C', submoduleCwd, 'stash', 'push']);
                        await this.refresh();
                        break;
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
                const submodulePath = await requireKnownSubmodulePath(repo, msg.path);
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
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'add', '-A']);
                await this.refresh();
                break;
            }

            case 'changes/submoduleUnstageAll': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
                await repo.exec(['-C', path.join(repo.cwd, submodulePath), 'reset', 'HEAD']);
                await this.refresh();
                break;
            }

            case 'changes/submoduleDiscardAll': {
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
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
                const submodulePath = await requireKnownSubmodulePath(repo, msg.submodulePath);
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
                const submodulePath = await requireKnownSubmodulePath(repo, msg.path);
                const subPath = path.join(repo.cwd, submodulePath);
                const [raw, stashRaw] = await Promise.all([
                    repo.execRaw(['-C', subPath, 'status', '--porcelain', '-z', '--untracked-files=all']),
                    repo.exec(['-C', subPath, 'stash', 'list', '--format=%gd %s']),
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
                        staged: staged.map(toEntry),
                        unstaged: unstaged.map(toEntry),
                        conflicts: conflicts.map(toEntry),
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
        case 'changes/openSubmoduleDiff':
        case 'changes/submoduleOpenFile':
        case 'changes/submoduleOpenMergeEditor':
        case 'changes/openSubmoduleStashDiff':
        case 'changes/openStashDiff':
            return 'vscodeCommandFailed';
        case 'changes/commit':
        case 'changes/submoduleCommit':
            return 'gitOperationFailed';
        default:
            return 'gitOperationFailed';
    }
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

async function requireKnownSubmodulePath(repo: GitRepository, requestedPath: string): Promise<string> {
    const submodulePaths = await repo.getSubmodulePaths();
    if (!submodulePaths.has(requestedPath)) {
        throw new Error(`Unknown submodule path: ${requestedPath}`);
    }
    return requestedPath;
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
