import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import { createLookGitScenarioFixture } from '@tests/helpers/look-git-scenario';

describe('semantic git runtime integration', () => {
    it('executes semantic repository and worktree actions against the lookGit fixture', async () => {
        const fixture = createLookGitScenarioFixture('semantic-actions', 'look-git-runtime-semantic-');
        try {
            const runtime = new CliGitRuntime((args, context, options) => new GitCliBackend(context.cwd).run(args, options));
            const gitDir = await new GitCliBackend(fixture.repo).run(['rev-parse', '--absolute-git-dir']);
            const head = await new GitCliBackend(fixture.repo).run(['rev-parse', 'HEAD']);
            const repository = new RuntimeGitRepository({
                repoId: 'semantic-actions',
                cwd: fixture.repo,
                gitDir: gitDir.trim(),
                kind: 'main',
                label: 'semantic-actions',
            }, runtime);
            const worktree = new RuntimeWorktree({
                repoId: 'semantic-actions',
                worktreeId: 'semantic-actions-main',
                path: fixture.repo,
                gitDir: gitDir.trim(),
                repositoryKind: 'main',
                isMain: true,
                head: head.trim(),
                branch: 'main',
                dirty: true,
            }, runtime);

            await expect(repository.listRemotes()).resolves.toEqual(['origin']);
            await expect(repository.getUpstreamBranch('main')).resolves.toBe('origin/main');
            await expect(repository.getAheadBehind('main', 'origin/main')).resolves.toEqual({ ahead: 1, behind: 0 });
            expect((await repository.listTags()).map((tag) => tag.name)).toEqual(expect.arrayContaining([
                'semantic-conflict-pick',
                'semantic-local-tag',
                'semantic-reset-base',
            ]));
            expect((await repository.listWorktrees()).map((item) => item.branch)).toEqual(expect.arrayContaining([
                'refs/heads/main',
                'refs/heads/feature/semantic-worktree',
                undefined,
            ]));

            const initialStatus = await worktree.getStatus();
            expect(initialStatus.staged.some((entry) => entry.filePath === 'src/semantic-staged.ts')).toBe(true);
            expect(initialStatus.unstaged.some((entry) => entry.filePath === 'README.md')).toBe(true);
            expect((await worktree.listStashes({ limit: 10 })).items.some((stash) => stash.message.includes('wip(semantic): stash action fixture'))).toBe(true);

            await worktree.restoreStaged(['src/semantic-staged.ts']);
            await worktree.stage(['notes/semantic-untracked.md']);
            let status = await worktree.getStatus();
            expect(status.staged.some((entry) => entry.filePath === 'notes/semantic-untracked.md')).toBe(true);
            await worktree.restoreStaged(['notes/semantic-untracked.md']);
            await worktree.restoreWorkingTree(['README.md']);

            await expect(worktree.cherryPick('semantic-conflict-pick', {})).rejects.toThrow();
            status = await worktree.getStatus();
            expect(status.conflictState).toBe('none');
            expect(status.conflicts.some((entry) => entry.filePath === 'src/conflict.ts')).toBe(true);
            const conflictStages = await worktree.getConflictStages('src/conflict.ts');
            expect(conflictStages.base).toContain('base');
            expect(conflictStages.ours).toContain('current');
            expect(conflictStages.theirs).toContain('incoming');
            await worktree.abortCherryPick();

            await expect(worktree.previewClean(['notes/semantic-untracked.md'], { force: true })).resolves.toContain('notes/semantic-untracked.md');
            expect(fs.existsSync(path.join(fixture.repo, 'build', 'cache.log'))).toBe(true);
            await worktree.cleanIgnored(['build/cache.log'], { force: true });
            expect(fs.existsSync(path.join(fixture.repo, 'build', 'cache.log'))).toBe(false);

            await repository.createTag('semantic-runtime-tag', 'HEAD', undefined);
            await worktree.pushTags('origin', {});
            expect(await new GitCliBackend(fixture.repo).run(['ls-remote', '--tags', 'origin', 'semantic-runtime-tag'])).toContain('refs/tags/semantic-runtime-tag');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);
});
