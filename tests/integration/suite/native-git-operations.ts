import { execFileSync } from 'node:child_process';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { GitPushOutcome } from '@application/ports/git-capabilities';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { VscodeGitRemoteRuntime } from '@extension/git/vscode-git-remote-runtime';

export async function verifyNativePushDestination(repo: string): Promise<void> {
    const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const branch = 'lookgit-native-push-topic';
    const head = git(['rev-parse', 'HEAD']);
    const status = git(['status', '--porcelain']);
    git(['branch', branch, head]);
    try {
        git(['branch', '--set-upstream-to=origin/main', branch]);
        const worktree = new RuntimeWorktree({ repoId: repo, worktreeId: repo, path: repo, gitDir: path.join(repo, '.git'), repositoryKind: 'main', isMain: true, head, branch: 'main', dirty: true }, new VscodeGitRemoteRuntime());

        const outcome = await worktree.pushBranch(undefined, branch, {}, new AbortController().signal);

        assert.equal(outcome, GitPushOutcome.Completed);
        assert.equal(git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], head);
        assert.equal(git(['ls-remote', 'origin', `refs/heads/${branch}`]), '');
        assert.equal(git(['branch', '--show-current']), 'main');
        assert.equal(git(['status', '--porcelain']), status);
    } finally { git(['branch', '-D', branch]); }
}
