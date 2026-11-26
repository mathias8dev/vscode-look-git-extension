import * as vscode from 'vscode';
import type { MergeOptions } from '@application/ports/git-capabilities';
import type { Worktree } from '@application/ports/git-topology';
import { withCancellationSignal } from '@extension/utils/vscode-cancellation';

export async function mergeWithProgress(worktree: Worktree, ref: string, options: MergeOptions): Promise<void> {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Merging ${ref}`, cancellable: true },
        (_progress, token) => withCancellationSignal(token, signal => worktree.merge(ref, options, signal)));
}
