import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { PullStrategy } from '@application/ports/pull-strategy';
import { MergeStrategy } from '@application/ports/merge-strategy';
import { CommitCreationMode } from '@extension/git/commit-creation-mode';
import { pickCommitCreationMode, pickMergeOptions, pickPullOptions, pickRebaseOptions, pickResetMode, pickStashOptions } from '@extension/git/git-option-pickers';
import { resetMockVscode, setInputBoxValues, setQuickPickValue, window, workspace } from '@tests/mocks/vscode';

describe('Git option pickers', () => {
    afterEach(resetMockVscode);

    it.each([
        ['Pull (--rebase)', PullStrategy.Rebase],
        ['Pull (--no-rebase)', PullStrategy.Merge],
        ['Pull (--ff-only)', PullStrategy.FastForwardOnly],
        ['Pull (Git configuration)', PullStrategy.GitConfig],
    ] as const)('resolves %s to a semantic pull strategy', async (label, strategy) => {
        setQuickPickValue(label);
        expect(await pickPullOptions()).toEqual({ strategy });
    });

    it.each([
        ['Fast-forward (--ff)', MergeStrategy.FastForward],
        ['No-fast-forward (--no-ff)', MergeStrategy.NoFastForward],
        ['Squash (--squash)', MergeStrategy.Squash],
        ['Fast-forward only (--ff-only)', MergeStrategy.FastForwardOnly],
    ] as const)('resolves %s to a semantic merge strategy', async (label, strategy) => {
        setQuickPickValue(label);
        expect(await pickMergeOptions('feature')).toEqual({ strategy });
    });

    it('collects both commit messages before returning Squash + no-ff options', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        setQuickPickValue('Squash + no-ff');
        setInputBoxValues(['feat: combined change', 'Merge feature']);

        expect(await pickMergeOptions('feature')).toEqual({
            strategy: MergeStrategy.SquashNoFastForward,
            squashMessage: 'feat: combined change',
            message: 'Merge feature',
        });
    });

    it.each([{ messages: [] }, { messages: ['feat: combined change'] }])('cancels Squash + no-ff if a message editor is cancelled', async ({ messages }) => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        setQuickPickValue('Squash + no-ff');
        setInputBoxValues(messages);

        expect(await pickMergeOptions('feature')).toBeUndefined();
    });

    it('reuses the configured commit message editor for both messages', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'editor');
        setQuickPickValue('Squash + no-ff');
        const selection = pickMergeOptions('feature', vscode.Uri.file('/extension'));
        await vi.waitFor(() => expect(window.webviewPanels).toHaveLength(1));
        window.webviewPanels[0]?.webview.messageHandler?.({ type: 'commitMessage/apply', message: 'feat: combined change' });
        await vi.waitFor(() => expect(window.webviewPanels).toHaveLength(2));
        window.webviewPanels[1]?.webview.messageHandler?.({ type: 'commitMessage/apply', message: 'Merge feature' });

        expect(await selection).toEqual({
            strategy: MergeStrategy.SquashNoFastForward, squashMessage: 'feat: combined change', message: 'Merge feature',
        });
        expect(window.webviewPanels.every(panel => panel.disposed)).toBe(true);
    });

    it('combines the rebase-merges and autostash options', async () => {
        setQuickPickValue('Rebase (--rebase-merges --autostash)');
        expect(await pickRebaseOptions('main')).toEqual({ rebaseMerges: true, autostash: true });
    });

    it('exposes no-commit independently from the displayed operation', async () => {
        setQuickPickValue('Revert (--no-commit)');
        expect(await pickCommitCreationMode('Revert')).toBe(CommitCreationMode.NoCommit);
    });

    it.each([
        ['Stash', { includeUntracked: false, staged: false, keepIndex: false }],
        ['Stash (--include-untracked)', { includeUntracked: true, staged: false, keepIndex: false }],
        ['Stash (--staged)', { includeUntracked: false, staged: true, keepIndex: false }],
        ['Stash (--keep-index)', { includeUntracked: false, staged: false, keepIndex: true }],
    ] as const)('resolves %s without implicitly changing the stash scope', async (label, options) => {
        setQuickPickValue(label);
        expect(await pickStashOptions()).toEqual(options);
    });

    it('preserves cancellation across every Git option picker', async () => {
        setQuickPickValue(undefined);
        const results = await Promise.all([
            pickPullOptions(), pickMergeOptions('main'), pickRebaseOptions('main'),
            pickCommitCreationMode('Cherry-pick'), pickStashOptions(), pickResetMode(),
        ]);
        expect(results).toEqual(Array.from({ length: 6 }, () => undefined));
    });
});
