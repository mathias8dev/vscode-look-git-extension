import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { openVisualRebasePanel } from '@extension/utils/visual-rebase-panel';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';
import { resetVscodeMock } from '@tests/helpers/provider-runtime';
import { window } from '@tests/mocks/vscode';

const GIT_OPERATION_POLL = { timeout: 10_000, interval: 50 };

describe('openVisualRebasePanel', () => {
    const repos: TempGitRepo[] = [];
    const storageDirs: string[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
        while (storageDirs.length) { fs.rmSync(storageDirs.pop()!, { recursive: true, force: true }); }
        resetVscodeMock();
    });

    it('runs a visual rebase plan against a real repository', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/payments']);
        fixture.write('keep.txt', 'keep\n');
        const keepHash = fixture.commit('feat: keep');
        fixture.write('drop.txt', 'drop\n');
        const dropHash = fixture.commit('fix: drop me');
        const runtime = await runtimeFor(fixture);

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storageUri(), {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const panel = window.webviewPanels[0];
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: keepHash, action: 'pick', message: 'feat: keep' },
                { hash: dropHash, action: 'drop', message: 'fix: drop me' },
            ],
        });

        await expect.poll(() => fixture.gitTrim(['log', '--format=%s', 'main..feature/payments']), GIT_OPERATION_POLL).toBe('feat: keep');
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
    });

    it('pauses a real repository for edit actions and can abort the rebase', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/payments']);
        fixture.write('edit.txt', 'edit\n');
        const editHash = fixture.commit('feat: edit me');
        const runtime = await runtimeFor(fixture);

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storageUri(), {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const panel = window.webviewPanels[0];
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: editHash, action: 'edit', message: 'feat: edit me' },
            ],
        });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            rebaseInProgress: true,
        }));
        expect(rebaseDirectoryExists(fixture.cwd)).toBe(true);

        panel?.webview.messageHandler?.({ type: 'visualRebase/abort' });

        await expect.poll(() => rebaseDirectoryExists(fixture.cwd), GIT_OPERATION_POLL).toBe(false);
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            message: 'Rebase aborted.',
        }));
    });

    it('marks a resolved rebase conflict as staged before continuing', async () => {
        const fixture = track(createTempGitRepo());
        const panel = await openSingleConflictPanel(fixture);

        fixture.write('conflict.txt', 'resolved\n');
        panel?.webview.messageHandler?.({ type: 'visualRebase/markResolved', filePath: 'conflict.txt' });

        await expect.poll(() => fixture.gitTrim(['status', '--short']), GIT_OPERATION_POLL).toBe('M  conflict.txt');
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            message: 'All conflicts marked resolved. Continue the rebase.',
            rebaseInProgress: true,
        }));

        panel?.webview.messageHandler?.({ type: 'visualRebase/continue' });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['status', '--short'])).toBe('');
        expect(fixture.gitTrim(['show', 'HEAD:conflict.txt'])).toBe('resolved');
    });

    it('accepts incoming conflict content and stages it before continuing', async () => {
        const fixture = track(createTempGitRepo());
        const panel = await openSingleConflictPanel(fixture);

        panel?.webview.messageHandler?.({ type: 'visualRebase/acceptIncoming', filePath: 'conflict.txt' });

        await expect.poll(() => fixture.gitTrim(['status', '--short']), GIT_OPERATION_POLL).toBe('M  conflict.txt');
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            message: 'Accepted conflict side. Continue the rebase.',
            rebaseInProgress: true,
        }));

        panel?.webview.messageHandler?.({ type: 'visualRebase/continue' });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['status', '--short'])).toBe('');
        expect(fixture.gitTrim(['show', 'HEAD:conflict.txt'])).toBe('feature');
    });

    it('accepts yours conflict content and stages it before continuing', async () => {
        const fixture = track(createTempGitRepo());
        const panel = await openSingleConflictPanel(fixture);

        panel?.webview.messageHandler?.({ type: 'visualRebase/acceptYours', filePath: 'conflict.txt' });

        await expect.poll(() => fixture.gitTrim(['status', '--short']), GIT_OPERATION_POLL).toBe('');
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            message: 'Accepted conflict side. No changes remain; skip this commit to continue the rebase.',
            rebaseInProgress: true,
        }));

        panel?.webview.messageHandler?.({ type: 'visualRebase/skip' });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['status', '--short'])).toBe('');
        expect(fixture.gitTrim(['show', 'HEAD:conflict.txt'])).toBe('main');
    });

    it('runs a merge-aware visual rebase plan against a real repository', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/merge-aware']);
        fixture.write('feature-a.txt', 'feature a\n');
        const firstHash = fixture.commit('feat: first');
        fixture.git(['checkout', '-q', '-b', 'topic/merge-aware']);
        fixture.write('topic.txt', 'topic\n');
        const topicHash = fixture.commit('feat: topic');
        fixture.git(['checkout', '-q', 'feature/merge-aware']);
        fixture.write('feature-b.txt', 'feature b\n');
        const secondHash = fixture.commit('feat: second');
        fixture.git(['merge', '--no-ff', '-m', 'merge topic', 'topic/merge-aware']);
        const mergeHash = fixture.gitTrim(['rev-parse', 'HEAD']);
        const runtime = await runtimeFor(fixture);

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storageUri(), {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/merge-aware',
        });
        const panel = window.webviewPanels[0];
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/init',
            commits: expect.arrayContaining([
                expect.objectContaining({ hash: mergeHash, action: 'merge', isMerge: true }),
            ]),
        }));

        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: firstHash, action: 'pick', message: 'feat: first' },
                { hash: topicHash, action: 'pick', message: 'feat: topic' },
                { hash: secondHash, action: 'pick', message: 'feat: second' },
                { hash: mergeHash, action: 'merge', message: 'merge topic' },
            ],
        });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')).toHaveLength(3);
    });

    it('rewords a merge commit in a merge-aware visual rebase plan', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/merge-reword']);
        fixture.write('feature-a.txt', 'feature a\n');
        const firstHash = fixture.commit('feat: first');
        fixture.git(['checkout', '-q', '-b', 'topic/merge-reword']);
        fixture.write('topic.txt', 'topic\n');
        const topicHash = fixture.commit('feat: topic');
        fixture.git(['checkout', '-q', 'feature/merge-reword']);
        fixture.write('feature-b.txt', 'feature b\n');
        const secondHash = fixture.commit('feat: second');
        fixture.git(['merge', '--no-ff', '-m', 'merge topic', 'topic/merge-reword']);
        const mergeHash = fixture.gitTrim(['rev-parse', 'HEAD']);
        const runtime = await runtimeFor(fixture);

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storageUri(), {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/merge-reword',
        });
        const panel = window.webviewPanels[0];
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: firstHash, action: 'pick', message: 'feat: first' },
                { hash: topicHash, action: 'pick', message: 'feat: topic' },
                { hash: secondHash, action: 'pick', message: 'feat: second' },
                { hash: mergeHash, action: 'reword', message: 'merge: topic rewritten' },
            ],
        });

        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['log', '-1', '--format=%s'])).toBe('merge: topic rewritten');
        expect(fixture.gitTrim(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')).toHaveLength(3);
    });

    it('detects an in-progress rebase when the panel is reopened', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/payments']);
        fixture.write('edit.txt', 'edit\n');
        const editHash = fixture.commit('feat: edit me');
        const runtime = await runtimeFor(fixture);

        const storage = storageUri();
        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storage, {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const firstPanel = window.webviewPanels[0];
        firstPanel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        firstPanel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: editHash, action: 'edit', message: 'feat: edit me' },
            ],
        });
        await expect.poll(() => firstPanel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            rebaseInProgress: true,
        }));
        expect(fs.existsSync(path.join(fixture.cwd, '.git', 'look-git'))).toBe(false);

        firstPanel?.dispose();
        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storage, {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const reopenedPanel = window.webviewPanels[1];
        reopenedPanel?.webview.messageHandler?.({ type: 'visualRebase/ready' });

        await expect.poll(() => reopenedPanel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            message: 'Interactive rebase already in progress. Resolve the current stop, then continue.',
            rebaseInProgress: true,
        }));
        expect(reopenedPanel?.webview.messages).toContainEqual(expect.objectContaining({
            type: 'visualRebase/init',
            commits: [],
        }));

        reopenedPanel?.webview.messageHandler?.({ type: 'visualRebase/abort' });

        await expect.poll(() => rebaseDirectoryExists(fixture.cwd), GIT_OPERATION_POLL).toBe(false);
    });

    it('restores the persisted editor runtime when continuing from a reopened panel', async () => {
        const fixture = track(createTempGitRepo());
        fixture.write('base.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/payments']);
        fixture.write('edit.txt', 'edit\n');
        const editHash = fixture.commit('feat: edit me');
        fixture.write('reword.txt', 'reword\n');
        const rewordHash = fixture.commit('feat: reword me');
        const runtime = await runtimeFor(fixture);
        const storage = storageUri();

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storage, {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const firstPanel = window.webviewPanels[0];
        firstPanel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        firstPanel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: editHash, action: 'edit', message: 'feat: edit me' },
                { hash: rewordHash, action: 'reword', message: 'feat: reworded after reopen' },
            ],
        });
        await expect.poll(() => firstPanel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            rebaseInProgress: true,
        }));

        firstPanel?.dispose();
        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storage, {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/payments',
        });
        const reopenedPanel = window.webviewPanels[1];
        reopenedPanel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        reopenedPanel?.webview.messageHandler?.({ type: 'visualRebase/continue' });

        await expect.poll(() => reopenedPanel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({ type: 'visualRebase/completed' }));
        expect(fixture.gitTrim(['log', '--format=%s', 'main..feature/payments'])).toBe('feat: reworded after reopen\nfeat: edit me');
    });

    function track(repo: TempGitRepo): TempGitRepo {
        repos.push(repo);
        return repo;
    }

    async function openSingleConflictPanel(fixture: TempGitRepo) {
        fixture.write('conflict.txt', 'base\n');
        fixture.commit('base');
        fixture.git(['checkout', '-q', '-b', 'feature/conflict']);
        fixture.write('conflict.txt', 'feature\n');
        const featureHash = fixture.commit('feat: conflict');
        fixture.git(['checkout', '-q', 'main']);
        fixture.write('conflict.txt', 'main\n');
        fixture.commit('main conflict');
        fixture.git(['checkout', '-q', 'feature/conflict']);
        const runtime = await runtimeFor(fixture);

        await openVisualRebasePanel(runtime.repository, runtime.worktree, vscode.Uri.file('/ext'), storageUri(), {
            upstream: 'main',
            onto: 'main',
            branch: 'feature/conflict',
        });
        const panel = window.webviewPanels[window.webviewPanels.length - 1];
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });
        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: featureHash, action: 'pick', message: 'feat: conflict' },
            ],
        });

        await expect.poll(() => fixture.gitTrim(['status', '--short']), GIT_OPERATION_POLL).toContain('UU conflict.txt');
        await expect.poll(() => panel?.webview.messages, GIT_OPERATION_POLL).toContainEqual(expect.objectContaining({
            type: 'visualRebase/error',
            rebaseInProgress: true,
        }));
        return panel;
    }

    async function runtimeFor(fixture: TempGitRepo): Promise<{ readonly repository: RuntimeGitRepository; readonly worktree: RuntimeWorktree }> {
        const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
        const backend = new GitCliBackend(fixture.cwd);
        const gitDir = (await backend.run(['rev-parse', '--absolute-git-dir'])).trim();
        const head = (await backend.run(['rev-parse', 'HEAD'])).trim();
        const branch = fixture.gitTrim(['branch', '--show-current']) || undefined;
        return {
            repository: new RuntimeGitRepository({
                repoId: 'visual-rebase-test',
                cwd: fixture.cwd,
                gitDir,
                kind: 'main',
                label: 'visual-rebase-test',
            }, runtime),
            worktree: new RuntimeWorktree({
                repoId: 'visual-rebase-test',
                worktreeId: 'visual-rebase-test-main',
                path: fixture.cwd,
                gitDir,
                repositoryKind: 'main',
                isMain: true,
                head,
                branch,
                dirty: false,
            }, runtime),
        };
    }

    function storageUri(): vscode.Uri {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-storage-'));
        storageDirs.push(dir);
        return vscode.Uri.file(dir);
    }

    function rebaseDirectoryExists(cwd: string): boolean {
        return fs.existsSync(path.join(cwd, '.git', 'rebase-merge')) || fs.existsSync(path.join(cwd, '.git', 'rebase-apply'));
    }
});
