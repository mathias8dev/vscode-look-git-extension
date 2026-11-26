import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { promptForCommitMessage } from '@extension/utils/commit-message-editor';
import { commands, resetMockVscode, Uri, window, workspace } from '@tests/mocks/vscode';

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

    it('automatically generates once and lets the user apply an edited suggestion', async () => {
        const generateMessage = vi.fn(async () => 'feat: generated squash');
        const result = promptForCommitMessage('draft', 'Squash commit message', extensionUri, { generateMessage, autoGenerate: true });
        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/ready' });
        panel.webview.messageHandler?.({ type: 'commitMessage/ready' });

        await vi.waitFor(() => expect(panel.webview.messages).toContainEqual(expect.objectContaining({ type: 'commitMessage/generated', message: 'feat: generated squash' })));
        expect(generateMessage).toHaveBeenCalledOnce();
        panel.webview.messageHandler?.({ type: 'commitMessage/apply', message: 'feat: edited squash' });

        expect(await result).toBe('feat: edited squash');
    });

    it('pre-fills the configured input box with a generated draft that remains editable', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        window.inputBoxValue = 'feat: edited squash';
        const generateMessage = vi.fn(async () => 'feat: generated squash');

        expect(await promptForCommitMessage('draft', 'Squash commit message', extensionUri, { generateMessage, autoGenerate: true })).toBe('feat: edited squash');
        expect(window.inputBoxOptions).toContainEqual(expect.objectContaining({ value: 'feat: generated squash' }));
    });

    it('cancels automatic generation when the editor closes', async () => {
        let generationSignal: AbortSignal | undefined;
        let finishGeneration: ((message: string) => void) | undefined;
        const generateMessage = (signal: AbortSignal) => new Promise<string>(resolve => {
            generationSignal = signal;
            finishGeneration = resolve;
        });
        const result = promptForCommitMessage('draft', 'Squash commit message', extensionUri, { generateMessage, autoGenerate: true });
        const panel = await waitForCommitMessagePanel();
        panel.webview.messageHandler?.({ type: 'commitMessage/ready' });
        await vi.waitFor(() => expect(generationSignal).toBeDefined());

        panel.dispose();
        expect(await result).toBeUndefined();
        expect(generationSignal?.aborted).toBe(true);
        finishGeneration?.('feat: late suggestion');
        await Promise.resolve();
        expect(panel.webview.messages).not.toContainEqual(expect.objectContaining({ type: 'commitMessage/generated' }));
    });

    it('does not open an input box after generation is cancelled', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        const generateMessage = async () => { throw new DOMException('Cancelled', 'AbortError'); };

        expect(await promptForCommitMessage('draft', 'Squash commit message', extensionUri, { generateMessage, autoGenerate: true })).toBeUndefined();
        expect(window.inputBoxOptions).toEqual([]);
        expect(window.warningMessages).toEqual([]);
    });

    it('keeps manual editing available and reports automatic generation failures', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        window.inputBoxValue = 'feat: manual squash';
        const generateMessage = async () => { throw new Error('No language model available'); };

        expect(await promptForCommitMessage('draft', 'Squash commit message', extensionUri, { generateMessage, autoGenerate: true })).toBe('feat: manual squash');
        expect(window.warningMessages).toContainEqual(expect.objectContaining({ message: expect.stringContaining('No language model available') }));
        expect(window.inputBoxOptions).toContainEqual(expect.objectContaining({ value: 'draft' }));
    });

    it('opens manual input without waiting for the generation warning to be dismissed', async () => {
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        window.inputBoxValue = 'feat: manual squash';
        const warning = vi.spyOn(window, 'showWarningMessage').mockReturnValue(new Promise<undefined>(() => {}));
        try {
            expect(await promptForCommitMessage('draft', 'Squash commit message', extensionUri, {
                autoGenerate: true,
                generateMessage: async () => { throw new Error('No language model available'); },
            })).toBe('feat: manual squash');
            expect(warning).toHaveBeenCalledOnce();
        } finally { warning.mockRestore(); }
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
