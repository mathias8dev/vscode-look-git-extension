import * as vscode from 'vscode';
import type { GitService, ResetMode } from '../gitService';
import type { CommitHistoryProvider } from '../commitHistoryProvider';
import type { CommitItem } from '../commitItem';
import { confirmDangerousOperation, selectCommitFromQuickPick } from '../utils/confirmation';

interface ResetModeOption {
    label: string;
    description: string;
    detail: string;
    mode: ResetMode;
}

export async function handleReset(
    gitService: GitService,
    historyProvider: CommitHistoryProvider,
    item?: CommitItem
): Promise<void> {
    const commit = item?.commitInfo
        ?? await selectCommitFromQuickPick(gitService, 'Select a commit to reset to');

    if (!commit) {
        return;
    }

    const modeOptions: ResetModeOption[] = [
        {
            label: '$(debug-step-back) Soft Reset',
            description: '--soft',
            detail: 'Move HEAD to this commit. All changes remain staged.',
            mode: 'soft',
        },
        {
            label: '$(discard) Mixed Reset',
            description: '--mixed (default)',
            detail: 'Move HEAD to this commit. Changes are unstaged but preserved in working directory.',
            mode: 'mixed',
        },
        {
            label: '$(warning) Hard Reset',
            description: '--hard',
            detail: 'Move HEAD to this commit. ALL changes are DISCARDED permanently.',
            mode: 'hard',
        },
    ];

    const selected = await vscode.window.showQuickPick(modeOptions, {
        placeHolder: `Reset to ${commit.shortHash}: "${commit.message}"`,
    });

    if (!selected) {
        return;
    }

    if (selected.mode === 'hard') {
        const confirmed = await confirmDangerousOperation('hard reset to', commit);
        if (!confirmed) {
            return;
        }
    }

    try {
        await gitService.reset(commit.hash, selected.mode);
        vscode.window.showInformationMessage(
            `Reset (${selected.mode}) to ${commit.shortHash} successful.`
        );
        historyProvider.refresh();
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Reset failed: ${message}`);
    }
}
