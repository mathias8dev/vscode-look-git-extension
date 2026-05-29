import * as vscode from 'vscode';
import * as path from 'path';
import type { GitRepository } from '../../core/git/GitRepository';
import type { ChangesWebviewToExtensionMessage, ChangesExtensionToWebviewMessage } from '../../protocol/changes/messages';
import type { StatusData, StatusEntry } from '../../protocol/changes/types';
import type { SerializedRepoContext } from '../../protocol/shared/repo';
import { queryStashFiles } from '../../core/queries/queryStatus';
import { showModalWarningMessage } from '../utils/confirmation';

type PostMessage = (msg: ChangesExtensionToWebviewMessage) => void;
type RefreshCallback = () => Promise<void>;

export class ChangesMessageRouter {
    constructor(
        private readonly repo: GitRepository,
        private readonly postMessage: PostMessage,
        private readonly refresh: RefreshCallback,
    ) {}

    async handle(msg: ChangesWebviewToExtensionMessage): Promise<void> {
        try {
            await this.dispatch(msg);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.postMessage({ type: 'changes/error', message: `Git operation failed: ${message}` });
            await this.refresh().catch(() => undefined);
        }
    }

    private async dispatch(msg: ChangesWebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'changes/ready':
                await this.refresh();
                break;

            case 'changes/viewModeChanged':
                await vscode.commands.executeCommand('setContext', 'lookGit.viewAsTree', msg.asTree);
                break;

            case 'changes/stageFile':
                await this.repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/unstageFile':
                await this.repo.unstageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/stageAll':
                await this.repo.stageAll();
                await this.refresh();
                break;

            case 'changes/unstageAll':
                await this.repo.unstageAll();
                await this.refresh();
                break;

            case 'changes/discardFile': {
                const choice = await showModalWarningMessage(
                    `Discard changes to "${msg.filePath}"? This cannot be undone.`, 'Discard',
                );
                if (choice === 'Discard') {
                    await this.repo.discardFile(msg.filePath);
                    await this.refresh();
                }
                break;
            }

            case 'changes/discardAll': {
                const choice = await showModalWarningMessage('Discard all changes? This cannot be undone.', 'Discard All');
                if (choice === 'Discard All') {
                    await this.repo.unstageAll().catch(() => undefined);
                    const status = await this.repo.getStatus();
                    for (const entry of status.unstaged) {
                        await this.repo.discardFile(entry.filePath);
                    }
                    await this.refresh();
                }
                break;
            }

            case 'changes/markResolved':
                await this.repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/acceptOurs':
                await this.repo.acceptOurs(msg.filePath);
                await this.repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/acceptTheirs':
                await this.repo.acceptTheirs(msg.filePath);
                await this.repo.stageFile(msg.filePath);
                await this.refresh();
                break;

            case 'changes/acceptAllTheirs': {
                const status = await this.repo.getStatus();
                for (const entry of status.conflicts) {
                    await this.repo.acceptTheirs(entry.filePath);
                    await this.repo.stageFile(entry.filePath);
                }
                await this.refresh();
                break;
            }

            case 'changes/commit': {
                const message = msg.message.trim();
                if (!message) {
                    this.postMessage({ type: 'changes/commitResult', success: false, error: 'Commit message cannot be empty.' });
                    return;
                }
                try {
                    switch (msg.mode) {
                        case 'amend':      await this.repo.commitAmend(message); break;
                        case 'commitPush': await this.repo.commit(message); await this.repo.push(); break;
                        case 'commitSync': await this.repo.pullAndPush(); break;
                        default:           await this.repo.commit(message); break;
                    }
                    this.postMessage({ type: 'changes/commitResult', success: true });
                    await vscode.window.showInformationMessage('Committed successfully.');
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    this.postMessage({ type: 'changes/commitResult', success: false, error: errMsg });
                }
                await this.refresh();
                break;
            }

            case 'changes/openFile': {
                const uri = vscode.Uri.file(path.join(this.repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.open', uri);
                break;
            }

            case 'changes/openSubmodule': {
                const uri = vscode.Uri.file(path.join(this.repo.cwd, msg.filePath));
                await vscode.commands.executeCommand('vscode.openFolder', uri);
                break;
            }

            case 'changes/openMergeEditor': {
                const uri = vscode.Uri.file(path.join(this.repo.cwd, msg.filePath));
                try {
                    await vscode.commands.executeCommand('merge-conflict.accept.select', uri);
                } catch {
                    await vscode.commands.executeCommand('vscode.open', uri);
                }
                break;
            }

            case 'changes/openDiff': {
                const cwd = this.repo.cwd;
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
                await this.repo.stash(msg.message);
                await this.refresh();
                break;

            case 'changes/stashStaged':
                await this.repo.stashStaged(msg.message);
                await this.refresh();
                break;

            case 'changes/stashPop':
                await this.repo.stashPop(msg.index);
                await this.refresh();
                break;

            case 'changes/stashApply':
                await this.repo.stashApply(msg.index);
                await this.refresh();
                break;

            case 'changes/stashDrop': {
                const choice = await showModalWarningMessage('Drop this stash entry? This cannot be undone.', 'Drop');
                if (choice === 'Drop') {
                    await this.repo.stashDrop(msg.index);
                    await this.refresh();
                }
                break;
            }

            case 'changes/getStashFiles': {
                const files = await queryStashFiles(
                    this.repo.execRaw.bind(this.repo),
                    msg.index,
                );
                this.postMessage({
                    type: 'changes/stashFiles',
                    requestId: msg.requestId,
                    index: msg.index,
                    files: files.map((f) => ({ status: f.status, filePath: f.filePath, origPath: f.origPath })),
                });
                break;
            }

            case 'changes/openStashDiff': {
                const cwd = this.repo.cwd;
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
                if (msg.conflictState === 'merge') { await this.repo.mergeContinue(); }
                else { await this.repo.rebaseContinue(); }
                await this.refresh();
                break;

            case 'changes/abortOp': {
                const opName = msg.conflictState === 'merge' ? 'merge' : 'rebase';
                const choice = await showModalWarningMessage(`Abort the current ${opName}?`, 'Abort');
                if (choice === 'Abort') {
                    if (msg.conflictState === 'merge') { await this.repo.mergeAbort(); }
                    else { await this.repo.rebaseAbort(); }
                    await this.refresh();
                }
                break;
            }

            default:
                break;
        }
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
            staged: status.staged.map(toEntry),
            unstaged: status.unstaged.map(toEntry),
            conflicts: status.conflicts.map(toEntry),
            conflictState: status.conflictState,
            stashes: stashes.map((s) => ({ index: s.index, message: s.message })),
        },
    };
}

export function serializeContext(cwd: string): SerializedRepoContext {
    const crypto = require('crypto');
    return {
        id: crypto.createHash('sha256').update(cwd).digest('hex').substring(0, 16),
        cwd,
        kind: 'main',
        label: cwd.split('/').pop() ?? cwd,
    };
}
