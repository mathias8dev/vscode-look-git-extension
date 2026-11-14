import * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBranchCommand } from '@extension/commands/branch-commands';
import { createComparisonFixture } from '@tests/helpers/comparison-fixture';
import { commands, resetMockVscode, window as mockWindow } from '@tests/mocks/vscode';
import { openComparisonPanel } from '@extension/views/comparison-panel';

describe('branch comparison entry point', () => {
    afterEach(resetMockVscode);
    it('opens branch comparison in a separate window without changing the repository', async () => {
        const { repo, repository } = createComparisonFixture();
        try {
            const result = await runBranchCommand(repository, 'compareWithCurrent', 'feature', false, undefined, { repository }, vscode.Uri.file('/extension'));
            expect(result.shouldRefresh).toBe(false);
            expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
            const panel = mockWindow.webviewPanels.at(-1);
            expect(panel?.viewType).toBe('lookGit.comparison');
            expect(panel?.webview.html).toContain('comparison.js');
            expect(panel?.options).toEqual(expect.objectContaining({ enableScripts: true }));
            expect(commands.calls).toContainEqual({ command: 'workbench.action.moveEditorToNewWindow', args: [] });
            panel?.dispose();
        } finally { repo.cleanup(); }
    });

    it('keeps the comparison panel available and warns when opening a separate window fails', async () => {
        const { repo, repository } = createComparisonFixture();
        commands.failCommand('workbench.action.moveEditorToNewWindow', new Error('unsupported'));
        const panel = openComparisonPanel(repository, vscode.Uri.file('/extension'), 'main', 'feature');
        try {
            await vi.waitFor(() => expect(mockWindow.warningMessages).toContainEqual({
                message: 'Could not open branch comparison in a separate window. Continuing in an editor tab.',
                items: [],
            }));
            expect(mockWindow.webviewPanels.at(-1)?.disposed).toBe(false);
            expect(panel.webview.html).toContain('comparison.js');
        } finally { panel.dispose(); repo.cleanup(); }
    });
});
