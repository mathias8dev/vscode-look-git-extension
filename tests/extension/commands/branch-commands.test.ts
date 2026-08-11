import { afterEach, describe, expect, it } from 'vitest';
import { runBranchCommand } from '@extension/commands/branch-commands';
import type { RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createRemoteWorkflowFixture, type RemoteWorkflowFixture } from '@tests/helpers/git-repo';
import { resetMockVscode, setQuickPickValue, setWarningChoice } from '@tests/mocks/vscode';

describe('runBranchCommand', () => {
    const fixtures: RemoteWorkflowFixture[] = [];

    afterEach(() => {
        while (fixtures.length) { fixtures.pop()!.cleanup(); }
        resetMockVscode();
    });

    it('updates a non-current local branch by fast-forwarding its ref to the fetched upstream', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        fixture.local.git(['checkout', '-q', '--track', '-b', 'feature/nested', 'origin/feature/nested']);
        fixture.local.git(['checkout', '-q', 'main']);
        fixture.seed.git(['checkout', '-q', 'feature/nested']);
        fixture.seed.commitFile('feature.txt', 'feature\nremote update\n', 'remote feature update');
        fixture.seed.git(['push', '-q', 'origin', 'feature/nested']);
        const targets = runtimeTargetsFor(fixture);

        await runBranchCommand(targets.repository, 'update', 'feature/nested', false, undefined, targets);

        expect(fixture.local.gitTrim(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
        expect(fixture.local.gitTrim(['rev-parse', 'feature/nested'])).toBe(fixture.local.gitTrim(['rev-parse', 'origin/feature/nested']));
    });

    it('rejects non-current local branch updates when the branch diverged from its upstream', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        fixture.local.git(['checkout', '-q', '--track', '-b', 'feature/nested', 'origin/feature/nested']);
        fixture.local.commitFile('local-feature.txt', 'local\n', 'local feature update');
        fixture.local.git(['checkout', '-q', 'main']);
        fixture.seed.git(['checkout', '-q', 'feature/nested']);
        fixture.seed.commitFile('feature.txt', 'feature\nremote update\n', 'remote feature update');
        fixture.seed.git(['push', '-q', 'origin', 'feature/nested']);
        const targets = runtimeTargetsFor(fixture);
        const originalFeatureHead = fixture.local.gitTrim(['rev-parse', 'feature/nested']);

        await expect(runBranchCommand(targets.repository, 'update', 'feature/nested', false, undefined, targets))
            .rejects.toThrow('have diverged');

        expect(fixture.local.gitTrim(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
        expect(fixture.local.gitTrim(['rev-parse', 'feature/nested'])).toBe(originalFeatureHead);
    });

    it('publishes the selected branch without prompting when it has no upstream', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        setQuickPickValue(undefined);

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'local-only']));
    });

    it('pushes the selected branch without prompting when it is only ahead', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
        fixture.local.git(['checkout', '-q', 'local-only']);
        fixture.local.commitFile('local-ahead.txt', 'local ahead\n', 'local ahead update');
        fixture.local.git(['checkout', '-q', 'main']);
        setQuickPickValue(undefined);

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'local-only']));
    });

    it('does not push a selected branch that is only behind when update is dismissed', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
        advanceRemoteLocalOnlyBranch(fixture);
        const localHead = fixture.local.gitTrim(['rev-parse', 'local-only']);
        setWarningChoice(undefined);

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(false);

        expect(fixture.local.gitTrim(['rev-parse', 'local-only'])).toBe(localHead);
    });

    it('updates a selected branch that is only behind', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
        advanceRemoteLocalOnlyBranch(fixture);
        setWarningChoice('Update Branch');

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.local.gitTrim(['rev-parse', 'local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'origin/local-only']));
    });

    it('offers checkout as the primary recovery for a diverged non-current branch', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']);
        setQuickPickValue('Check Out Branch');

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.local.gitTrim(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('local-only');
        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only'])).toBe(remoteHead);
    });

    it('offers update as the primary recovery for a diverged current branch', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        fixture.local.git(['checkout', '-q', 'local-only']);
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']);
        setQuickPickValue('Update Branch');

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only'])).toBe(remoteHead);
        expect(() => fixture.local.git(['merge-base', '--is-ancestor', 'origin/local-only', 'local-only'])).not.toThrow();
    });

    it('force pushes a diverged selected branch with lease', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        setQuickPickValue('Force Push with Lease');

        await runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'local-only']));
    });

    it('force pushes a diverged selected branch without a lease', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        setQuickPickValue('More Push Actions...');
        setWarningChoice('Force Push');

        await runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'local-only']));
    });

    it('does not force push when the advanced confirmation is dismissed', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']);
        setQuickPickValue('More Push Actions...');
        setWarningChoice(undefined);

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(false);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only'])).toBe(remoteHead);
    });

    it('does not push a diverged branch when the push mode picker is dismissed', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        divergeLocalOnlyBranch(fixture);
        const remoteHead = fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']);
        setQuickPickValue(undefined);

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(false);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only'])).toBe(remoteHead);
    });

    it('recovers from a non-fast-forward rejection caused by stale tracking state', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
        fixture.local.git(['checkout', '-q', 'local-only']);
        fixture.local.commitFile('stale-local.txt', 'stale local\n', 'stale local update');
        fixture.local.git(['checkout', '-q', 'main']);
        advanceRemoteLocalOnlyBranch(fixture, false);
        setQuickPickValue('Force Push with Lease');

        await expect(runBranchCommand(targets.repository, 'push', 'local-only', false, undefined, targets))
            .resolves.toBe(true);

        expect(fixture.remote.gitTrim(['rev-parse', 'refs/heads/local-only']))
            .toBe(fixture.local.gitTrim(['rev-parse', 'local-only']));
    });

    it('prompts for merge mode and runs a squash merge when selected', async () => {
        const fixture = track(createRemoteWorkflowFixture());
        const targets = runtimeTargetsFor(fixture);
        setQuickPickValue('Squash Merge');

        await runBranchCommand(targets.repository, 'mergeInto', 'origin/feature/nested', true, undefined, targets);

        expect(fixture.local.gitTrim(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main');
        expect(fixture.local.gitTrim(['status', '--porcelain'])).toContain('A  feature.txt');
        expect(() => fixture.local.gitTrim(['rev-parse', '--verify', 'MERGE_HEAD'])).toThrow();
    });

    function track(fixture: RemoteWorkflowFixture): RemoteWorkflowFixture {
        fixtures.push(fixture);
        return fixture;
    }
});

function divergeLocalOnlyBranch(fixture: RemoteWorkflowFixture): void {
    fixture.local.git(['push', '-q', '-u', 'origin', 'local-only']);
    fixture.local.git(['checkout', '-q', 'local-only']);
    fixture.local.commitFile('local-diverged.txt', 'local diverged\n', 'local diverged update');
    fixture.local.git(['checkout', '-q', 'main']);
    advanceRemoteLocalOnlyBranch(fixture);
}

function advanceRemoteLocalOnlyBranch(fixture: RemoteWorkflowFixture, fetchLocal = true): void {
    fixture.seed.git(['fetch', '-q', 'origin']);
    fixture.seed.git(['checkout', '-q', '-b', 'local-only', 'origin/local-only']);
    fixture.seed.commitFile('remote-diverged.txt', 'remote diverged\n', 'remote diverged update');
    fixture.seed.git(['push', '-q', 'origin', 'local-only']);
    if (fetchLocal) { fixture.local.git(['fetch', '-q', 'origin']); }
}

function runtimeTargetsFor(fixture: RemoteWorkflowFixture): RuntimeCommandTargets & { readonly repository: RuntimeGitRepository } {
    const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
    const gitDir = fixture.local.gitTrim(['rev-parse', '--absolute-git-dir']);
    const head = fixture.local.gitTrim(['rev-parse', 'HEAD']);
    const repository = new RuntimeGitRepository({
        repoId: 'branch-command-test',
        cwd: fixture.local.cwd,
        gitDir,
        kind: 'main',
        label: 'branch-command-test',
    }, runtime);
    const worktree = new RuntimeWorktree({
        repoId: 'branch-command-test',
        worktreeId: 'branch-command-test-main',
        path: fixture.local.cwd,
        gitDir,
        repositoryKind: 'main',
        isMain: true,
        head,
        branch: 'main',
        dirty: false,
    }, runtime);
    return {
        repository,
        worktree,
        worktrees: [worktree],
    };
}
