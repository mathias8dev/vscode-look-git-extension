import { afterEach, describe, expect, it } from 'vitest';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('selected stash', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('captures selected staged and untracked files without capturing unrelated staged files', async () => {
        const repo = createRepo(repos, { 'base.txt': 'base\n' });
        const worktree = runtimeWorktree(repo);
        repo.write('selected-staged.txt', 'selected staged\n');
        repo.write('selected-untracked.txt', 'selected untracked\n');
        repo.write('unrelated-staged.txt', 'unrelated staged\n');
        repo.git(['add', '--', 'selected-staged.txt', 'unrelated-staged.txt']);

        await worktree.stash('selected files', {
            includeUntracked: true,
            paths: ['selected-staged.txt', 'selected-untracked.txt'],
        });

        expect(repo.gitTrim(['status', '--short'])).toBe('A  unrelated-staged.txt');
        expect(await stashFilePaths(worktree)).toEqual(['selected-staged.txt', 'selected-untracked.txt']);
    });

    it('preserves unrelated partial staging exactly', async () => {
        const repo = createRepo(repos, {
            'selected.txt': 'selected base\n',
            'unrelated.txt': 'one\nbase staged\nbase unstaged\n',
        });
        const worktree = runtimeWorktree(repo);
        repo.write('unrelated.txt', 'one\nstaged change\nbase unstaged\n');
        repo.git(['add', '--', 'unrelated.txt']);
        repo.write('unrelated.txt', 'one\nstaged change\nunstaged change\n');
        repo.write('selected.txt', 'selected change\n');
        const stagedDiff = repo.git(['diff', '--cached', '--binary', '--', 'unrelated.txt']);
        const unstagedDiff = repo.git(['diff', '--binary', '--', 'unrelated.txt']);

        await worktree.stash('selected file', { paths: ['selected.txt'] });

        expect(repo.git(['diff', '--cached', '--binary', '--', 'unrelated.txt'])).toBe(stagedDiff);
        expect(repo.git(['diff', '--binary', '--', 'unrelated.txt'])).toBe(unstagedDiff);
        expect(await stashFilePaths(worktree)).toEqual(['selected.txt']);
    });

    it('captures both staged and unstaged hunks from a selected tracked file', async () => {
        const baseContent = 'one\nbase staged\nbase unstaged\n';
        const stagedContent = 'one\nstaged change\nbase unstaged\n';
        const workingContent = 'one\nstaged change\nunstaged change\n';
        const repo = createRepo(repos, { 'selected.txt': baseContent });
        const worktree = runtimeWorktree(repo);
        repo.write('selected.txt', stagedContent);
        repo.git(['add', '--', 'selected.txt']);
        repo.write('selected.txt', workingContent);

        await worktree.stash('selected partial staging', { paths: ['selected.txt'] });

        expect(repo.gitTrim(['status', '--short', '--', 'selected.txt'])).toBe('');
        expect(repo.git(['show', 'stash@{0}^2:selected.txt'])).toBe(stagedContent);
        expect(repo.git(['show', 'stash@{0}:selected.txt'])).toBe(workingContent);
        expect(await stashFilePaths(worktree)).toEqual(['selected.txt']);
    });
});

function createRepo(repos: TempGitRepo[], files: Readonly<Record<string, string>>): TempGitRepo {
    const repo = createTempGitRepo();
    repos.push(repo);
    for (const [filePath, content] of Object.entries(files)) {
        repo.write(filePath, content);
    }
    repo.commit('base');
    return repo;
}

function runtimeWorktree(repo: TempGitRepo): RuntimeWorktree {
    const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
    return new RuntimeWorktree({
        repoId: 'repo',
        worktreeId: 'main',
        path: repo.cwd,
        gitDir: repo.gitTrim(['rev-parse', '--absolute-git-dir']),
        repositoryKind: 'main',
        isMain: true,
        head: repo.gitTrim(['rev-parse', 'HEAD']),
        branch: 'main',
        dirty: true,
    }, runtime);
}

async function stashFilePaths(worktree: RuntimeWorktree): Promise<readonly string[]> {
    return (await worktree.getStashFiles('stash@{0}')).map((file) => file.filePath).sort();
}
