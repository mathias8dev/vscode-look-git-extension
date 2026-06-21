// @vitest-environment jsdom

import * as fs from 'node:fs';
import * as path from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictState } from '@protocol/changes/types';
import type { ChangesWebviewToExtensionMessage } from '@protocol/changes/messages';
import { createMockVsCodeApi, sendToWebview, type MockVsCodeApi } from '@tests/helpers/webview-runtime';
import { createSemanticRuntimeFixture, type SemanticRuntimeFixture } from '@tests/helpers/semantic-runtime-fixture';

describe('ChangesWebview real repo e2e', () => {
    beforeEach(() => {
        vi.resetModules();
        document.documentElement.removeAttribute('style');
        document.body.removeAttribute('style');
        document.body.innerHTML = '<div id="root"></div>';
    });

    it('clicks stage, unstage, stage-all, and commit controls and validates git state', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-webview-clicks-');
        try {
            const api = createMockVsCodeApi();
            const { ChangesWebview } = await import('@webview/changes/changes-webview');
            render(<ChangesWebview />);
            await postStatus(fixture);

            await clickRowAction('README.md', 'Stage file');
            await drainWebviewMessages(api, fixture);
            expect(fixture.git(['status', '--porcelain', '--', 'README.md'])).toContain('M  README.md');

            await clickRowAction('README.md', 'Unstage file');
            await drainWebviewMessages(api, fixture);
            expect(fixture.git(['status', '--porcelain', '--', 'README.md'])).toContain(' M README.md');

            fireEvent.click(await screen.findByRole('button', { name: 'Stage all changed files' }));
            await drainWebviewMessages(api, fixture);
            expect(fixture.git(['status', '--porcelain'])).toContain('M  README.md');
            expect(fixture.git(['status', '--porcelain'])).toContain('A  notes/semantic-untracked.md');

            const messageInput = await screen.findByLabelText('Commit message');
            fireEvent.change(messageInput, { target: { value: 'test(changes): commit from webview click' } });
            fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
            await drainWebviewMessages(api, fixture);

            expect(fixture.git(['log', '-1', '--format=%s']).trim()).toBe('test(changes): commit from webview click');
            expect(fixture.git(['status', '--porcelain', '--', 'README.md', 'notes/semantic-untracked.md', 'src/semantic-staged.ts'])).toBe('');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('clicks conflict resolution and continue controls and validates merge state', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-webview-conflicts-');
        try {
            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            fixture.git(['clean', '-fd']);
            expect(() => fixture.git(['merge', 'feature/cherry-pick-source'])).toThrow();

            const api = createMockVsCodeApi();
            const { ChangesWebview } = await import('@webview/changes/changes-webview');
            render(<ChangesWebview />);
            await postStatus(fixture);

            expect(await screen.findByLabelText('Operation in progress')).toHaveTextContent('Merge in progress');
            await clickRowAction('src/conflict.ts', 'Accept incoming changes (theirs)');
            await drainWebviewMessages(api, fixture);

            expect(fs.readFileSync(path.join(fixture.fixture.repo, 'src', 'conflict.ts'), 'utf8')).toContain('incoming');
            await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled());
            fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
            await drainWebviewMessages(api, fixture);

            const gitDir = fixture.git(['rev-parse', '--absolute-git-dir']).trim();
            expect(fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))).toBe(false);
            expect(fixture.git(['status', '--porcelain', '--', 'src/conflict.ts'])).toBe('');

            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            expect(() => fixture.git(['merge', 'feature/cherry-pick-source'])).toThrow();
            await postStatus(fixture);
            fireEvent.click(await screen.findByRole('button', { name: 'Abort' }));
            await drainWebviewMessages(api, fixture);
            expect(fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))).toBe(false);
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('clicks stash controls and validates stash plus working tree state', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-webview-stash-');
        try {
            fixture.git(['reset', '--hard', 'HEAD']);
            fixture.git(['clean', '-fd']);
            fs.writeFileSync(path.join(fixture.fixture.repo, 'src', 'webview-stash.ts'), 'export const webviewStash = true;\n');

            const api = createMockVsCodeApi();
            const { ChangesWebview } = await import('@webview/changes/changes-webview');
            render(<ChangesWebview />);
            await postStatus(fixture);

            fireEvent.click(await screen.findByRole('button', { name: 'Stash changes' }));
            fireEvent.change(await screen.findByLabelText('Stash message'), { target: { value: 'webview stash click' } });
            fireEvent.click(screen.getByRole('button', { name: 'Stash' }));
            await drainWebviewMessages(api, fixture);

            expect(fixture.git(['stash', 'list', '--format=%s'])).toContain('webview stash click');
            expect(fs.existsSync(path.join(fixture.fixture.repo, 'src', 'webview-stash.ts'))).toBe(false);
        } finally {
            fixture.cleanup();
        }
    }, 120_000);
});

async function postStatus(fixture: SemanticRuntimeFixture): Promise<void> {
    await act(async () => {
        sendToWebview(await fixture.refreshStatusMessage());
    });
}

async function clickRowAction(rowTitle: string, actionName: string): Promise<void> {
    const row = await screen.findByTitle(rowTitle);
    fireEvent.mouseEnter(row);
    fireEvent.click(await screen.findByRole('button', { name: actionName }));
}

async function drainWebviewMessages(api: MockVsCodeApi, fixture: SemanticRuntimeFixture): Promise<void> {
    const start = api.messages.length;
    for (const message of api.messages.slice(start - 1)) {
        if (isChangesMessage(message)) {
            await handleMessage(message, fixture);
        }
    }
    await postStatus(fixture);
}

async function handleMessage(message: ChangesWebviewToExtensionMessage, fixture: SemanticRuntimeFixture): Promise<void> {
    switch (message.type) {
        case 'changes/stageFile':
            await fixture.worktree.stage([message.filePath]);
            return;
        case 'changes/unstageFile':
            await fixture.worktree.unstage([message.filePath]);
            return;
        case 'changes/stageAll':
            await fixture.worktree.stageAll();
            return;
        case 'changes/commit':
            await fixture.worktree.commit(message.message, {});
            await act(async () => {
                sendToWebview({ type: 'changes/commitResult', success: true });
            });
            return;
        case 'changes/stash':
            await fixture.worktree.stash(message.message, { includeUntracked: true });
            return;
        case 'changes/acceptTheirs':
            await fixture.worktree.acceptTheirs([message.filePath]);
            return;
        case 'changes/abortOp':
            if (message.conflictState === ConflictState.Merge) {
                await fixture.worktree.abortMerge();
            } else {
                await fixture.worktree.abortRebase();
            }
            return;
        case 'changes/continueOp':
            if (message.conflictState === ConflictState.Merge) {
                await fixture.worktree.continueMerge();
            } else {
                await fixture.worktree.continueRebase();
            }
            return;
        default:
            return;
    }
}

function isChangesMessage(message: unknown): message is ChangesWebviewToExtensionMessage {
    if (typeof message !== 'object' || message === null) { return false; }
    const type = (message as { readonly type?: unknown }).type;
    return typeof type === 'string' && type.startsWith('changes/');
}
