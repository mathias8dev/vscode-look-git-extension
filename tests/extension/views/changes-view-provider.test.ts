import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { RepositorySelectionAccessor } from '@extension/repositories/repository-selection-store';
import { ChangesViewProvider } from '@extension/views/changes-view-provider';
import { makeWebviewView, resetVscodeMock } from '@tests/helpers/provider-runtime';

describe('ChangesViewProvider', () => {
    beforeEach(() => {
        resetVscodeMock();
        vi.useFakeTimers();
    });

    it('does not post a refresh error while the runtime repository is not ready', async () => {
        const context = {
            id: 'repo-1',
            cwd: '/repo',
            kind: RepoKind.Main,
            label: 'repo',
        } satisfies RepoContext;
        const repositories = { currentContext: context } satisfies RepositorySelectionAccessor;
        const beforeRefresh = vi.fn(async () => false);
        const provider = new ChangesViewProvider(
            vscode.Uri.file('/extension'),
            repositories,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            beforeRefresh,
        );
        const view = makeWebviewView();

        provider.resolveWebviewView(view);
        await provider.refresh();

        expect(beforeRefresh).toHaveBeenCalledOnce();
        expect(view.messages).not.toContainEqual(expect.objectContaining({ type: 'changes/error' }));
        vi.clearAllTimers();
    });
});
