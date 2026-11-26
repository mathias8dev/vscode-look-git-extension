import { afterEach, describe, expect, it } from 'vitest';
import { PullStrategy } from '@application/ports/pull-strategy';
import { GitPushOutcome } from '@application/ports/git-capabilities';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { pushWithRecovery } from '@extension/git/branch-remote-actions';
import { createRemoteWorkflowFixture, type RemoteWorkflowFixture } from '@tests/helpers/git-repo';
import { resetMockVscode, setQuickPickValue, setQuickPickValues } from '@tests/mocks/vscode';

describe('pull strategies and push recovery', () => {
    const fixtures: RemoteWorkflowFixture[] = [];

    afterEach(() => {
        for (const fixture of fixtures.splice(0)) { fixture.cleanup(); }
        resetMockVscode();
    });

    it('rebases divergent commits even when configuration requests merge and fast-forward only', async () => {
        const { fixture, worktree } = setup();
        fixture.local.git(['config', 'pull.rebase', 'false']);
        fixture.local.git(['config', 'pull.ff', 'only']);
        const previousHead = fixture.local.gitTrim(['rev-parse', 'HEAD']);

        await worktree.pull({ strategy: PullStrategy.Rebase });

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).not.toBe(previousHead);
        expect(fixture.local.gitTrim(['rev-parse', 'HEAD^'])).toBe(fixture.remote.gitTrim(['rev-parse', 'local-only']));
        expect(fixture.local.gitTrim(['log', '-1', '--format=%s'])).toBe('local commit');
        expect(fixture.local.gitTrim(['rev-list', '--merges', 'origin/local-only..HEAD'])).toBe('');
    });

    it('merges divergent commits even when configuration requests rebase and fast-forward only', async () => {
        const { fixture, worktree } = setup();
        fixture.local.git(['config', 'pull.rebase', 'true']);
        fixture.local.git(['config', 'pull.ff', 'only']);
        const previousHead = fixture.local.gitTrim(['rev-parse', 'HEAD']);

        await worktree.pull({ strategy: PullStrategy.Merge });

        expect(fixture.local.gitTrim(['show', '-s', '--format=%P', 'HEAD']).split(' ')).toEqual([
            previousHead, fixture.remote.gitTrim(['rev-parse', 'local-only']),
        ]);
    });

    it('rejects divergent fast-forward-only pulls without moving HEAD', async () => {
        const { fixture, worktree } = setup();
        fixture.local.git(['config', 'pull.rebase', 'true']);
        const previousHead = fixture.local.gitTrim(['rev-parse', 'HEAD']);

        await expect(worktree.pull({ strategy: PullStrategy.FastForwardOnly })).rejects.toThrow();

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(previousHead);
        expect(fixture.local.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('fast-forwards when there are only upstream commits', async () => {
        const { fixture, worktree } = setup(false);

        await worktree.pull({ strategy: PullStrategy.FastForwardOnly });

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(fixture.remote.gitTrim(['rev-parse', 'local-only']));
    });

    it.each([true, false])('honors pull.rebase=%s when the Git configuration strategy is selected', async rebase => {
        const { fixture, worktree } = setup();
        fixture.local.git(['config', 'pull.rebase', String(rebase)]);
        fixture.local.git(['config', 'pull.ff', 'true']);

        await worktree.pull({ strategy: PullStrategy.GitConfig });

        expect(fixture.local.gitTrim(['show', '-s', '--format=%P', 'HEAD']).split(' ')).toHaveLength(rebase ? 1 : 2);
    });

    it('pulls an explicitly selected remote branch instead of the configured upstream', async () => {
        const { fixture, worktree } = setup(false);
        fixture.local.git(['branch', '--set-upstream-to=origin/main', 'local-only']);

        await worktree.pull({ strategy: PullStrategy.FastForwardOnly, remote: 'origin', branch: 'local-only' });

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(fixture.remote.gitTrim(['rev-parse', 'local-only']));
    });

    it('does not execute an aborted pull', async () => {
        const { fixture, worktree } = setup();
        const previousHead = fixture.local.gitTrim(['rev-parse', 'HEAD']);
        const controller = new AbortController();
        controller.abort();

        await expect(worktree.pull({ strategy: PullStrategy.Rebase }, controller.signal)).rejects.toThrow();

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(previousHead);
    });

    it('forwards cancellation before attempting a push or recovery', async () => {
        const { fixture, repository, worktree } = setup();
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'local-only']);
        const controller = new AbortController();
        controller.abort();

        await expect(pushWithRecovery(repository, worktree, undefined, controller.signal)).rejects.toThrow();

        expect(fixture.remote.gitTrim(['rev-parse', 'local-only'])).toBe(remoteHead);
    });

    it('offers the existing push actions and then the shared pull strategy on rejection', async () => {
        const { fixture, repository, worktree } = setup();
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'local-only']);
        setQuickPickValues(['Update Branch', 'Pull (--rebase)']);

        await expect(pushWithRecovery(repository, worktree)).resolves.toBe(GitPushOutcome.NotPushed);

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD^'])).toBe(remoteHead);
        expect(fixture.remote.gitTrim(['rev-parse', 'local-only'])).toBe(remoteHead);
    });

    it('does not change local or remote history when push recovery is cancelled', async () => {
        const { fixture, repository, worktree } = setup();
        const localHead = fixture.local.gitTrim(['rev-parse', 'HEAD']);
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'local-only']);
        setQuickPickValue(undefined);

        await expect(pushWithRecovery(repository, worktree)).resolves.toBe(GitPushOutcome.Cancelled);

        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(localHead);
        expect(fixture.remote.gitTrim(['rev-parse', 'local-only'])).toBe(remoteHead);
    });

    it('keeps force-with-lease available from the shared push recovery', async () => {
        const { fixture, repository, worktree } = setup();
        setQuickPickValue('Force Push with Lease');

        await expect(pushWithRecovery(repository, worktree)).resolves.toBe(GitPushOutcome.Completed);

        expect(fixture.remote.gitTrim(['rev-parse', 'local-only'])).toBe(fixture.local.gitTrim(['rev-parse', 'HEAD']));
    });

    function setup(diverged = true) {
        const fixture = createRemoteWorkflowFixture();
        fixtures.push(fixture);
        fixture.local.git(['checkout', '-q', 'local-only']);
        fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
        fixture.seed.git(['fetch', '-q', 'origin']);
        fixture.seed.git(['checkout', '-q', '-b', 'local-only', 'origin/local-only']);
        fixture.seed.commitFile('remote-only.txt', 'remote\n', 'remote commit');
        fixture.seed.git(['push', '-q', 'origin', 'local-only']);
        if (diverged) { fixture.local.commitFile('local-only.txt', 'local\n', 'local commit'); }
        const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
        const gitDir = fixture.local.gitTrim(['rev-parse', '--absolute-git-dir']);
        const repository = new RuntimeGitRepository({ repoId: 'pull-test', cwd: fixture.local.cwd, gitDir, kind: 'main', label: 'pull-test' }, runtime);
        const worktree = new RuntimeWorktree({
            repoId: 'pull-test', worktreeId: 'pull-test-main', path: fixture.local.cwd, gitDir,
            repositoryKind: 'main', isMain: true, head: fixture.local.gitTrim(['rev-parse', 'HEAD']), branch: 'local-only', dirty: false,
        }, runtime);
        return { fixture, repository, worktree };
    }
});
