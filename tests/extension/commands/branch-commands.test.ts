import { afterEach, describe, expect, it } from 'vitest';
import { runBranchCommand } from '@extension/commands/branch-commands';
import type { RuntimeCommandTargets } from '@extension/commands/runtime-command-targets';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createRemoteWorkflowFixture, type RemoteWorkflowFixture } from '@tests/helpers/git-repo';

describe('runBranchCommand', () => {
    const fixtures: RemoteWorkflowFixture[] = [];

    afterEach(() => {
        while (fixtures.length) { fixtures.pop()!.cleanup(); }
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

    function track(fixture: RemoteWorkflowFixture): RemoteWorkflowFixture {
        fixtures.push(fixture);
        return fixture;
    }
});

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
