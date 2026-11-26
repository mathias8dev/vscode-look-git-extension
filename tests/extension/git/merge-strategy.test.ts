import { afterEach, describe, expect, it } from 'vitest';
import { MergeStrategy } from '@application/ports/merge-strategy';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SQUASH_NO_FF_OPTIONS = {
    strategy: MergeStrategy.SquashNoFastForward,
    squashMessage: 'feat: combined feature',
    message: 'Merge feature (squashed)',
} as const;

describe('merge strategies', () => {
    const repos: TempGitRepo[] = [];
    afterEach(() => { for (const repo of repos.splice(0)) { repo.cleanup(); } });

    it('fast-forwards even when merge.ff is configured false', async () => {
        const { repo, worktree, featureHead } = setup();
        repo.git(['config', 'merge.ff', 'false']);

        await worktree.merge('feature', { strategy: MergeStrategy.FastForward });

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(featureHead);
    });

    it('creates a merge commit for no-ff even when fast-forward is possible', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();
        repo.git(['config', 'merge.ff', 'true']);

        await worktree.merge('feature', { strategy: MergeStrategy.NoFastForward });

        expect(repo.gitTrim(['show', '-s', '--format=%P', 'HEAD']).split(' ')).toEqual([baseHead, featureHead]);
    });

    it('creates a merge commit with --ff when the histories diverge', async () => {
        const { repo, worktree, featureHead } = setup();
        const currentHead = repo.commitFile('target.txt', 'target\n', 'target commit');

        await worktree.merge('feature', { strategy: MergeStrategy.FastForward });

        expect(repo.gitTrim(['show', '-s', '--format=%P', 'HEAD']).split(' ')).toEqual([currentHead, featureHead]);
    });

    it('refuses a divergent ff-only merge without changing the target', async () => {
        const { repo, worktree } = setup();
        const currentHead = repo.commitFile('target.txt', 'target\n', 'target commit');

        await expect(worktree.merge('feature', { strategy: MergeStrategy.FastForwardOnly })).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(currentHead);
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('stages squash changes without committing or rewriting the source branch', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();

        await worktree.merge('feature', { strategy: MergeStrategy.Squash });

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(repo.gitTrim(['diff', '--cached', '--name-only'])).toBe('feature.txt');
        expect(repo.gitTrim(['show', ':feature.txt'])).toBe('feature\nsecond');
        expect(() => repo.git(['rev-parse', '--verify', 'MERGE_HEAD'])).toThrow();
        expect(await worktree.getSquashMergeMessage()).toContain('feature commit');
    });

    it.each([false, true])('adds a squash commit and a merge commit, with a diverged target: %s', async diverged => {
        const { repo, worktree, baseHead, featureHead } = setup();
        if (diverged) { repo.commitFile('target.txt', 'target\n', 'target commit'); }
        const previousHead = repo.gitTrim(['rev-parse', 'HEAD']);
        const refsBefore = repo.gitTrim(['for-each-ref', '--format=%(refname)']);

        await worktree.merge('feature', SQUASH_NO_FF_OPTIONS);

        const squashHead = repo.gitTrim(['rev-parse', 'HEAD^2']);
        expect(repo.gitTrim(['rev-parse', 'HEAD^1'])).toBe(previousHead);
        expect(repo.gitTrim(['show', '-s', '--format=%P', squashHead])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', `${squashHead}^{tree}`])).toBe(repo.gitTrim(['rev-parse', `${featureHead}^{tree}`]));
        expect(repo.gitTrim(['log', '-1', '--format=%s', squashHead])).toBe(SQUASH_NO_FF_OPTIONS.squashMessage);
        expect(repo.gitTrim(['log', '-1', '--format=%s'])).toBe(SQUASH_NO_FF_OPTIONS.message);
        expect(repo.gitTrim(['rev-list', '--count', `${previousHead}..HEAD`])).toBe('2');
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(repo.gitTrim(['merge-base', 'HEAD', 'feature'])).toBe(baseHead);
        expect(repo.gitTrim(['for-each-ref', '--format=%(refname)'])).toBe(refsBefore);
        expect(repo.gitTrim(['show', 'HEAD:feature.txt'])).toBe('feature\nsecond');
        if (diverged) { expect(repo.gitTrim(['show', 'HEAD:target.txt'])).toBe('target'); }
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('keeps conflicts in the native merge state and continues after resolution', async () => {
        const { repo, worktree, baseHead } = setup();
        repo.git(['checkout', '-q', 'feature']);
        const sourceHead = repo.commitFile('base.txt', 'source\n', 'source change');
        repo.git(['checkout', '-q', '-']);
        const previousHead = repo.commitFile('base.txt', 'target\n', 'target change');

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow();

        const status = await worktree.getStatus();
        expect(status.conflictState).toBe('merge');
        expect(status.conflicts.map(file => file.filePath)).toContain('base.txt');
        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(previousHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(sourceHead);
        const squashHead = repo.gitTrim(['rev-parse', 'MERGE_HEAD']);
        expect(repo.gitTrim(['rev-parse', `${squashHead}^`])).toBe(baseHead);
        repo.write('base.txt', 'resolved\n');
        await worktree.stage(['base.txt']);
        await worktree.continueMerge();

        expect(repo.gitTrim(['show', '-s', '--format=%P', 'HEAD']).split(' ')).toEqual([previousHead, squashHead]);
        expect(repo.gitTrim(['show', 'HEAD:base.txt'])).toBe('resolved');
        expect(repo.gitTrim(['log', '-1', '--format=%s'])).toBe(SQUASH_NO_FF_OPTIONS.message);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(sourceHead);
    });

    it('aborts a conflicting Squash + no-ff without changing either branch', async () => {
        const { repo, worktree } = setup();
        repo.git(['checkout', '-q', 'feature']);
        const sourceHead = repo.commitFile('base.txt', 'source\n', 'source change');
        repo.git(['checkout', '-q', '-']);
        const previousHead = repo.commitFile('base.txt', 'target\n', 'target change');

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow();
        await worktree.abortMerge();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(previousHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(sourceHead);
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
        expect(repo.gitTrim(['show', 'HEAD:base.txt'])).toBe('target');
    });

    it('does not create extra commits when the source is already merged', async () => {
        const { repo, worktree, featureHead } = setup();
        repo.git(['merge', '--ff-only', 'feature']);

        await worktree.merge('feature', SQUASH_NO_FF_OPTIONS);

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(featureHead);
    });

    it('preserves untracked files that would be overwritten by the merge', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();
        repo.write('feature.txt', 'untracked local content\n');

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(fs.readFileSync(path.join(repo.cwd, 'feature.txt'), 'utf8')).toBe('untracked local content\n');
    });

    it('honors signing requirements instead of creating an unsigned squash commit', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();
        repo.git(['config', 'commit.gpgSign', 'true']);
        repo.git(['config', 'gpg.format', 'openpgp']);
        repo.git(['config', 'gpg.program', '/missing/look-git-sign-test']);

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
    });

    it('runs the merge commit hook and leaves a recoverable merge if it rejects the message', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();
        const hookPath = path.join(repo.gitTrim(['rev-parse', '--absolute-git-dir']), 'hooks', 'commit-msg');
        fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(repo.gitTrim(['rev-parse', '--verify', 'MERGE_HEAD'])).not.toBe('');
        await worktree.abortMerge();
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it.each([false, true])('stops if the target changes during squash preparation, ref only: %s', async refOnly => {
        const { repo, worktree, baseHead, featureHead } = setup(args => {
            if (args[0] !== 'commit-tree') { return; }
            if (refOnly) { repo.git(['checkout', '-q', '-b', 'other-target']); }
            else { repo.commitFile('concurrent.txt', 'concurrent\n', 'concurrent commit'); }
        });

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS)).rejects.toThrow('target branch changed');

        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(() => repo.git(['rev-parse', '--verify', 'MERGE_HEAD'])).toThrow();
        if (refOnly) {
            expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
            expect(repo.gitTrim(['branch', '--show-current'])).toBe('other-target');
        } else { expect(repo.gitTrim(['log', '-1', '--format=%s'])).toBe('concurrent commit'); }
    });

    it('stops before changing the target if cancelled after creating the squash object', async () => {
        const controller = new AbortController();
        const { repo, worktree, baseHead, featureHead } = setup(args => {
            if (args[0] === 'commit-tree') { controller.abort(); }
        });

        await expect(worktree.merge('feature', SQUASH_NO_FF_OPTIONS, controller.signal)).rejects.toThrow();

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', 'feature'])).toBe(featureHead);
        expect(repo.gitTrim(['status', '--porcelain'])).toBe('');
    });

    it('can leave the merge ready for a manual commit', async () => {
        const { repo, worktree, baseHead, featureHead } = setup();

        await worktree.merge('feature', { ...SQUASH_NO_FF_OPTIONS, noCommit: true });

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
        expect(repo.gitTrim(['rev-parse', '--verify', 'MERGE_HEAD'])).not.toBe(featureHead);
        await worktree.continueMerge();
        expect(repo.gitTrim(['rev-list', '--count', `${baseHead}..HEAD`])).toBe('2');
        expect(repo.gitTrim(['log', '-1', '--format=%s'])).toBe(SQUASH_NO_FF_OPTIONS.message);
    });

    it('rejects missing messages before changing history', async () => {
        const { repo, worktree, baseHead } = setup();

        await expect(worktree.merge('feature', { strategy: MergeStrategy.SquashNoFastForward })).rejects.toThrow('requires squash and merge commit messages');

        expect(repo.gitTrim(['rev-parse', 'HEAD'])).toBe(baseHead);
    });

    function setup(afterCommand?: (args: readonly string[]) => void) {
        const repo = createTempGitRepo();
        repos.push(repo);
        repo.commitFile('base.txt', 'base\n', 'base commit');
        const baseHead = repo.gitTrim(['rev-parse', 'HEAD']);
        repo.git(['checkout', '-q', '-b', 'feature']);
        repo.commitFile('feature.txt', 'feature\n', 'feature commit');
        const featureHead = repo.commitFile('feature.txt', 'feature\nsecond\n', 'second feature commit');
        repo.git(['checkout', '-q', '-']);
        const gitDir = repo.gitTrim(['rev-parse', '--absolute-git-dir']);
        const runtime = new CliGitRuntime(async (args, context, options) => {
            const output = await new GitCliBackend(context.cwd).run(args, options);
            afterCommand?.(args);
            return output;
        });
        const worktree = new RuntimeWorktree({ repoId: 'merge-test', worktreeId: 'merge-test-main', path: repo.cwd, gitDir, repositoryKind: 'main', isMain: true, head: baseHead, branch: repo.gitTrim(['branch', '--show-current']), dirty: false }, runtime);
        return { repo, worktree, baseHead, featureHead };
    }
});
