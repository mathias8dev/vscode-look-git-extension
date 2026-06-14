import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { promptForCommitMessage } from '../../../src/extension/utils/commit-message-editor';
import { commands, resetMockVscode, Uri, window, workspace } from '../../mocks/vscode';

describe('promptForCommitMessage', () => {
    const extensionUri = Uri.file('/extension') as unknown as vscode.Uri; // TestUri provides the Uri surface used by this helper.

    beforeEach(() => {
        resetMockVscode();
        workspace.values.set('lookGit.commitMessageEditor', 'editor');
    });

    it('initializes the webview with the current commit message', async () => {
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri);

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/ready' });

        expect(panel.webview.messages.at(-1)).toEqual({
            type: 'commitMessage/init',
            title: 'Reword abc1234',
            message: 'old subject',
            canGenerate: false,
        });
    });

    it('generates a replacement message when the webview requests one', async () => {
        const generateMessage = vi.fn(async (_signal: AbortSignal) => 'fix(graph): refresh after branch deletion');
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri, { generateMessage });

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/ready' });
        panel.webview.messageHandler?.({ type: 'commitMessage/generate', requestId: 'request-1' });

        await vi.waitFor(() => {
            expect(panel.webview.messages).toContainEqual({
                type: 'commitMessage/generated',
                requestId: 'request-1',
                message: 'fix(graph): refresh after branch deletion',
            });
        });
        expect(panel.webview.messages).toContainEqual({
            type: 'commitMessage/init',
            title: 'Reword abc1234',
            message: 'old subject',
            canGenerate: true,
        });
        expect(panel.webview.messages).toContainEqual({
            type: 'commitMessage/generating',
            requestId: 'request-1',
        });
        expect(generateMessage).toHaveBeenCalledTimes(1);
    });

    it('sends generation errors back to the webview', async () => {
        const generateMessage = vi.fn(async (_signal: AbortSignal) => {
            throw new Error('No language model is available.');
        });
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri, { generateMessage });

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/generate', requestId: 'request-1' });

        await vi.waitFor(() => {
            expect(panel.webview.messages).toContainEqual({
                type: 'commitMessage/generationError',
                requestId: 'request-1',
                message: 'No language model is available.',
            });
        });
        expect(panel.disposed).toBe(false);
    });

    it('applies the edited message from the webview', async () => {
        let result: string | undefined;
        let done = false;
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri).then((value) => { result = value; done = true; });

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/apply', message: 'new subject\n\nbody' });

        await waitForDone(() => done);
        expect(result).toBe('new subject\n\nbody');
        expect(panel.disposed).toBe(true);
    });

    it('returns undefined for blank applied messages', async () => {
        let result: string | undefined = 'sentinel';
        let done = false;
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri).then((value) => { result = value; done = true; });

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/apply', message: '  \n ' });

        await waitForDone(() => done);
        expect(result).toBeUndefined();
    });

    it('returns undefined when cancelled from the webview', async () => {
        let result: string | undefined = 'sentinel';
        let done = false;
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri).then((value) => { result = value; done = true; });

        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/cancel' });

        await waitForDone(() => done);
        expect(result).toBeUndefined();
    });

    it('returns undefined when the panel is closed', async () => {
        let result: string | undefined = 'sentinel';
        let done = false;
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri).then((value) => { result = value; done = true; });

        const panel = await waitForCommitMessagePanel();
        panel.dispose();

        await waitForDone(() => done);
        expect(result).toBeUndefined();
    });

    it('moves the panel to a floating window by default', async () => {
        workspace.values = new Map();
        void promptForCommitMessage('old subject', 'Reword abc1234', extensionUri);

        await waitForCommitMessagePanel();
        expect(commands.calls.some((call) => call.command === 'workbench.action.moveEditorToNewWindow')).toBe(true);
    });

    it('uses the single-line input box when configured', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        window.inputBoxValue = 'new subject';

        await expect(promptForCommitMessage('old subject', 'Reword abc1234')).resolves.toBe('new subject');
        expect(window.inputBoxOptions).toEqual([{ prompt: 'New commit message:', value: 'old subject' }]);
        expect(window.webviewPanels).toHaveLength(0);
    });
});

async function waitForCommitMessagePanel(): Promise<typeof window.webviewPanels[number]> {
    let panel: typeof window.webviewPanels[number] | undefined;
    await vi.waitFor(() => {
        panel = window.webviewPanels.find((candidate) => candidate.viewType === 'lookGit.commitMessageEditor');
        if (!panel) { throw new Error('commit message panel did not open'); }
    });
    if (!panel) { throw new Error('commit message panel did not open'); }
    return panel;
}

async function waitForDone(isDone: () => boolean): Promise<void> {
    await vi.waitFor(() => {
        if (!isDone()) { throw new Error('operation did not finish'); }
    });
}
