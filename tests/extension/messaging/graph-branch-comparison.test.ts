import * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import { createComparisonFixture } from '@tests/helpers/comparison-fixture';
import { resetMockVscode, window as mockWindow } from '@tests/mocks/vscode';
import { messageForBranchComparison } from '@webview/features/graph/graph-commands';

describe('compare a branch pair from the graph', () => {
    afterEach(resetMockVscode);
    it('opens comparison with both selected refs and the requested repository', async () => {
        const { repo, repository } = createComparisonFixture();
        const context: RepoContext = { id: repository.repoId, cwd: repo.cwd, kind: RepoKind.Main, label: 'Fixture' };
        const registry = new RepositoryRegistry(); registry.registerRepository(repository);
        const router = new GraphMessageRouter({ currentContext: context, contexts: [context] }, () => undefined,
            undefined, undefined, undefined, undefined, vscode.Uri.file('/extension'), undefined, registry);
        try {
            await router.handle(messageForBranchComparison('refs/heads/feature', 'refs/heads/main', { repoId: repository.repoId, kind: 'main', path: repo.cwd }));
            const panel = mockWindow.webviewPanels.at(-1);
            expect(panel?.viewType).toBe('lookGit.comparison');
            panel?.webview.messageHandler?.({ type: 'comparison/ready', requestId: 'ready' });
            await vi.waitFor(() => expect(panel?.webview.messages).toContainEqual(expect.objectContaining({
                type: 'comparison/init', baseBranch: 'refs/heads/feature', headBranch: 'refs/heads/main',
            })));
            expect(repo.gitTrim(['branch', '--show-current'])).toBe('main');
            panel?.dispose();
        } finally { router.dispose(); repo.cleanup(); }
    });
});
