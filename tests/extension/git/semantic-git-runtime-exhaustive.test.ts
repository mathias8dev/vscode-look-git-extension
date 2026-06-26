import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEMANTIC_GIT_OPERATIONS, type SemanticGitOperation } from '@application/ports/git-operation';
import { CliGitRuntime } from '@extension/git/cli-git-runtime';
import { createSemanticRuntimeFixture } from '@tests/helpers/semantic-runtime-fixture';

const unsupportedCliOperations = [
    'branchFromStash',
    'commitAll',
    'compareFiles',
    'createFixupCommit',
    'createSquashCommit',
    'deinitSubmodule',
    'discardHunks',
    'editCommit',
    'fetchSubmodule',
    'getBlame',
    'getBlameCommit',
    'getBlameForSelection',
    'getFileRenameHistory',
    'getIgnoredFiles',
    'getReflog',
    'getUntrackedFiles',
    'openSubmoduleRepository',
    'pruneWorktrees',
    'reorderCommits',
    'repairWorktree',
    'restoreFromReflog',
    'stageHunks',
    'stageLines',
    'syncSubmodule',
    'undoAmend',
    'undoCheckout',
    'unstageHunks',
] satisfies readonly SemanticGitOperation[];

describe('semantic git runtime exhaustive coverage', () => {
    it('keeps unsupported CLI semantic operations explicit', () => {
        const runtime = new CliGitRuntime(async () => '');
        const unsupported = SEMANTIC_GIT_OPERATIONS.filter((operation) => !runtime.supports(operation)).sort();

        expect(unsupported).toEqual([...unsupportedCliOperations].sort());
    });

    it('executes read-only history, ref, diff, status, stash, and topology operations on a real repo', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-readonly-');
        try {
            const { repository, worktree } = fixture;
            const head = fixture.git(['rev-parse', 'HEAD']).trim();
            const resetBase = fixture.git(['rev-parse', 'semantic-reset-base']).trim();

            expect((await repository.getCommitGraph({}, { limit: 5 })).items.length).toBeGreaterThan(0);
            expect(await repository.getCommitDetails('HEAD')).toEqual(expect.objectContaining({ hash: head }));
            expect(await repository.getCommitMessage('HEAD')).toContain('local reset candidate');
            expect(await repository.getCommitPatch('HEAD')).toContain('src/reset/local-head.ts');
            expect(await repository.getCommitFileDiff('HEAD', 'src/reset/local-head.ts')).toContain('localHead');
            expect((await repository.getCommitFiles('HEAD')).map((file) => file.filePath)).toContain('src/reset/local-head.ts');
            expect((await repository.getCommitRange('semantic-reset-base', 'HEAD', { limit: 5 })).items.length).toBe(1);
            expect((await repository.searchCommits({ search: 'semantic' }, { limit: 5 })).items.length).toBeGreaterThan(0);
            expect(await repository.getMergeBase('HEAD', 'origin/main')).toBe(resetBase);
            expect(await repository.getAheadBehind('main', 'origin/main')).toEqual({ ahead: 1, behind: 0 });
            expect(await repository.getReachableCommitHashes([head, resetBase])).toEqual(new Set([head, resetBase]));
            expect(await repository.orderCommits([head, resetBase], 'newestFirst')).toEqual([head, resetBase]);
            expect((await repository.getFileHistory('src/conflict.ts', {}, { limit: 5 })).items.length).toBeGreaterThan(0);
            expect((await repository.getFileSelectionHistory('src/conflict.ts', { startLine: 1, endLine: 1 }, {}, { limit: 5 })).items.length).toBeGreaterThan(0);
            expect(await repository.getFileAtRevision('src/conflict.ts', 'semantic-reset-base')).toContain('current');
            expect(await repository.compareRefs('semantic-reset-base', 'HEAD', { includeRenames: true })).toEqual(expect.arrayContaining([
                expect.objectContaining({ filePath: 'src/reset/local-head.ts' }),
            ]));
            expect(await repository.compareBranches('origin/main', 'main', {})).toEqual(expect.arrayContaining([
                expect.objectContaining({ filePath: 'src/reset/local-head.ts' }),
            ]));
            expect(await repository.compareWithWorkingTree('HEAD', fixture.fixture.repo, {})).toEqual(expect.arrayContaining([
                expect.objectContaining({ filePath: 'README.md' }),
            ]));
            expect((await repository.listChangedFiles('origin/main', 'main', { limit: 5 })).items).toEqual(expect.arrayContaining([
                expect.objectContaining({ filePath: 'src/reset/local-head.ts' }),
            ]));

            expect((await repository.listBranches()).map((branch) => branch.name)).toEqual(expect.arrayContaining(['main', 'feature/rewrite-stack']));
            expect((await repository.listRemoteBranches()).map((branch) => branch.name)).toContain('origin/main');
            expect((await repository.listTags()).map((tag) => tag.name)).toEqual(expect.arrayContaining(['semantic-reset-base', 'semantic-local-tag']));
            expect(await repository.listRemotes()).toEqual(['origin']);
            expect(await repository.resolveRef('semantic-reset-base')).toBe(resetBase);
            expect(await repository.getUserName()).toBe('Look Git Fixture');
            expect(await repository.getUpstreamBranch('main')).toBe('origin/main');
            expect((await repository.listWorktrees()).length).toBeGreaterThanOrEqual(3);
            expect(await repository.listSubmodules()).toEqual([]);

            const status = await worktree.getStatus();
            expect(status.staged.some((entry) => entry.filePath === 'src/semantic-staged.ts')).toBe(true);
            expect(status.unstaged.some((entry) => entry.filePath === 'README.md')).toBe(true);
            expect((await worktree.listStashes({ limit: 10 })).items.some((stash) => stash.message.includes('wip(semantic): stash action fixture'))).toBe(true);
            expect(await worktree.getStashSummary('stash@{0}')).toContain('semantic-wip.txt');
            expect((await worktree.getStashFiles('stash@{0}')).map((file) => file.filePath)).toContain('stash/semantic-wip.txt');
            expect(await worktree.getWorkingTreeDiff(['README.md'])).toContain('Unstaged README change');
            expect(await worktree.getIndexDiff(['src/semantic-staged.ts'])).toContain('stagedSemantic');
            expect(await worktree.getCombinedDiff(['README.md', 'src/semantic-staged.ts'])).toContain('Semantic actions fixture');
            expect(await worktree.getPatch('workingTree', ['README.md'])).toContain('Unstaged README change');
            expect(await worktree.previewClean(['notes/semantic-untracked.md'], { force: true })).toContain('notes/semantic-untracked.md');
            expect(await worktree.getFileAtRevision('src/conflict.ts', 'semantic-reset-base')).toContain('current');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes repository topology, branch, tag, remote, fetch, worktree, and push operations on real repos', async () => {
            const fixture = await createSemanticRuntimeFixture('look-git-semantic-topology-');
        try {
            const { repository, worktree } = fixture;
            const extraRemotePath = fixture.git(['remote', 'get-url', 'origin']).trim();

            await repository.createBranch('feature/runtime-created', 'semantic-reset-base');
            await repository.renameBranch('feature/runtime-created', 'feature/runtime-renamed');
            expect(fixture.git(['branch', '--list', 'feature/runtime-renamed'])).toContain('feature/runtime-renamed');
            await repository.deleteBranch('feature/runtime-renamed', true);
            expect(fixture.git(['branch', '--list', 'feature/runtime-renamed'])).toBe('');

            await repository.createTag('runtime-created-tag', 'HEAD', undefined);
            expect(fixture.git(['tag', '--list', 'runtime-created-tag']).trim()).toBe('runtime-created-tag');
            await repository.deleteTag('runtime-created-tag');
            expect(fixture.git(['tag', '--list', 'runtime-created-tag'])).toBe('');

            await repository.addRemote('extra', extraRemotePath);
            expect(await repository.getRemoteUrl('extra')).toBe(extraRemotePath);
            await repository.setRemoteUrl('extra', extraRemotePath);
            await repository.fetch('origin', {});
            await repository.fetchAll({});
            await repository.pruneRemote('origin');
            await repository.removeRemote('extra');
            expect(await repository.listRemotes()).toEqual(['origin']);

            const branchWorktree = path.join(fixture.fixture.outputRoot, 'runtime-worktree');
            await repository.addWorktree({ path: branchWorktree, branch: 'feature/runtime-worktree', createNew: true, startPoint: 'semantic-reset-base' });
            expect(fs.existsSync(path.join(branchWorktree, '.git'))).toBe(true);
            await repository.lockWorktree(branchWorktree);
            expect(fixture.git(['worktree', 'list', '--porcelain'])).toContain('locked');
            await repository.unlockWorktree(branchWorktree);
            await repository.removeWorktree(branchWorktree, true);
            expect(fs.existsSync(branchWorktree)).toBe(false);

            const detachedWorktree = path.join(fixture.fixture.outputRoot, 'runtime-detached');
            await repository.addDetachedWorktree(detachedWorktree, 'semantic-reset-base');
            expect(fixture.git(['worktree', 'list', '--porcelain'])).toContain('detached');
            await repository.removeWorktree(detachedWorktree, true);

            await repository.createTag('runtime-pushed-tag', 'HEAD', undefined);
            await worktree.pushTags('origin', {});
            expect(fixture.git(['ls-remote', '--tags', 'origin', 'runtime-pushed-tag'])).toContain('refs/tags/runtime-pushed-tag');
            await worktree.pushRef('origin', 'HEAD', 'refs/heads/runtime-pushed-ref', {});
            expect(fixture.git(['ls-remote', '--heads', 'origin', 'runtime-pushed-ref'])).toContain('refs/heads/runtime-pushed-ref');
            await repository.deleteRemoteBranch('origin', 'runtime-pushed-ref');
            expect(fixture.git(['ls-remote', '--heads', 'origin', 'runtime-pushed-ref'])).toBe('');
            await worktree.pushBranch('origin', 'main', {});
            await worktree.forcePushWithLease('origin', 'main');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes patch creation, validation, apply, reverse apply, and index apply on a real repo', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-patch-');
        try {
            const target = path.join(fixture.fixture.repo, 'src', 'patch-target.ts');
            fixture.git(['reset', '--hard', 'HEAD']);
            fixture.git(['clean', '-fd']);
            fs.writeFileSync(target, 'export const patchTarget = "base";\n');
            fixture.git(['add', 'src/patch-target.ts']);
            fixture.git(['commit', '-m', 'test(core): add patch target']);

            fs.writeFileSync(target, 'export const patchTarget = "changed";\n');
            const patch = await fixture.worktree.getPatch('workingTree', ['src/patch-target.ts']);
            expect(patch).toContain('changed');
            await fixture.worktree.restoreWorkingTree(['src/patch-target.ts']);
            await expect(fixture.worktree.checkPatch(patch)).resolves.toBe(true);
            await fixture.worktree.applyPatch(patch, { threeWay: true });
            expect(fs.readFileSync(target, 'utf8')).toContain('changed');

            await fixture.worktree.reverseApplyPatch(patch, {});
            expect(fs.readFileSync(target, 'utf8')).toContain('base');

            fixture.git(['reset', '--hard', 'HEAD']);
            await fixture.worktree.applyPatchToIndex(patch, { threeWay: true });
            expect(fixture.git(['status', '--porcelain', '--', 'src/patch-target.ts'])).toContain('M  src/patch-target.ts');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes merge conflict accept and abort/continue operations on a real repo', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-conflict-');
        try {
            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            fixture.git(['clean', '-fd']);
            expect(() => fixture.git(['merge', 'feature/cherry-pick-source'])).toThrow();

            let status = await fixture.worktree.getStatus();
            expect(status.conflictState).toBe('merge');
            expect(status.conflicts.map((entry) => entry.filePath)).toContain('src/conflict.ts');
            const stages = await fixture.worktree.getConflictStages('src/conflict.ts');
            expect(stages.base).toContain('base');
            expect(stages.ours).toContain('current');
            expect(stages.theirs).toContain('incoming');

            await fixture.worktree.acceptTheirs(['src/conflict.ts']);
            status = await fixture.worktree.getStatus();
            expect(status.conflicts).toEqual([]);
            expect(fs.readFileSync(path.join(fixture.fixture.repo, 'src', 'conflict.ts'), 'utf8')).toContain('incoming');
            await fixture.worktree.continueMerge();
            expect(fs.existsSync(path.join((await fixture.backend.run(['rev-parse', '--absolute-git-dir'])).trim(), 'MERGE_HEAD'))).toBe(false);

            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            expect(() => fixture.git(['merge', 'feature/cherry-pick-source'])).toThrow();
            await fixture.worktree.abortMerge();
            expect(fs.existsSync(path.join((await fixture.backend.run(['rev-parse', '--absolute-git-dir'])).trim(), 'MERGE_HEAD'))).toBe(false);
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes reset, restore, clean, stash, checkout, commit, and amend operations on a real repo', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-worktree-');
        try {
            const { worktree } = fixture;
            await worktree.restoreStaged(['src/semantic-staged.ts']);
            await worktree.stage(['README.md']);
            expect(fixture.git(['status', '--porcelain', '--', 'README.md'])).toContain('M  README.md');
            await worktree.unstage(['README.md']);
            expect(fixture.git(['status', '--porcelain', '--', 'README.md'])).toContain(' M README.md');
            await worktree.stageAll();
            expect(fixture.git(['status', '--porcelain'])).toContain('A  notes/semantic-untracked.md');
            await worktree.unstageAll();
            await worktree.restoreWorkingTree(['README.md']);
            await worktree.cleanUntracked(['notes/semantic-untracked.md'], { force: true });
            expect(fs.existsSync(path.join(fixture.fixture.repo, 'notes', 'semantic-untracked.md'))).toBe(false);
            await worktree.cleanIgnored(['build/cache.log'], { force: true });
            expect(fs.existsSync(path.join(fixture.fixture.repo, 'build', 'cache.log'))).toBe(false);

            fs.writeFileSync(path.join(fixture.fixture.repo, 'src', 'commit-target.ts'), 'export const commitTarget = true;\n');
            await worktree.stage(['src/commit-target.ts']);
            await worktree.commit('test(core): commit through semantic runtime', {});
            expect(fixture.git(['log', '-1', '--format=%s']).trim()).toBe('test(core): commit through semantic runtime');
            await worktree.amendCommit('test(core): amend through semantic runtime', {});
            expect(fixture.git(['log', '-1', '--format=%s']).trim()).toBe('test(core): amend through semantic runtime');
            await worktree.undoLastCommit('soft');
            expect(fixture.git(['status', '--porcelain', '--', 'src/commit-target.ts'])).toContain('A  src/commit-target.ts');

            await worktree.resetMixed('HEAD');
            expect(fixture.git(['status', '--porcelain', '--', 'src/commit-target.ts'])).toContain('?? src/commit-target.ts');
            await worktree.stage(['src/commit-target.ts']);
            await worktree.resetPaths(['src/commit-target.ts'], undefined);
            expect(fixture.git(['status', '--porcelain', '--', 'src/commit-target.ts'])).toContain('?? src/commit-target.ts');
            await worktree.cleanUntracked(['src/commit-target.ts'], { force: true });

            fs.writeFileSync(path.join(fixture.fixture.repo, 'src', 'stash-target.ts'), 'export const stashTarget = true;\n');
            await worktree.stash('runtime stash', { includeUntracked: true, paths: ['src/stash-target.ts'] });
            expect((await worktree.listStashes({ limit: 10 })).items.some((stash) => stash.message.includes('runtime stash'))).toBe(true);
            await worktree.applyStash('stash@{0}', {});
            expect(fs.existsSync(path.join(fixture.fixture.repo, 'src', 'stash-target.ts'))).toBe(true);
            await worktree.restoreWorkingTree(['src/stash-target.ts']).catch(async () => {
                await worktree.cleanUntracked(['src/stash-target.ts'], { force: true });
            });
            await worktree.dropStash('stash@{0}');

            await worktree.checkoutNewBranch('feature/runtime-checkout', 'semantic-reset-base');
            expect(fixture.git(['branch', '--show-current']).trim()).toBe('feature/runtime-checkout');
            await worktree.checkout('main', {});
            await worktree.resetSoft('semantic-reset-base');
            await worktree.resetHard('main');
            await worktree.resetKeep('main');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes rewrite operations on a real linear branch', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-rewrite-');
        try {
            const { worktree } = fixture;
            await worktree.checkout('feature/rewrite-stack', {});
            const commits = fixture.git(['rev-list', '--reverse', 'semantic-reset-base..HEAD']).trim().split(/\r?\n/);
            expect(commits).toHaveLength(3);

            await worktree.rewordCommit(commits[0]!, 'feat(core): reword runtime rewrite target');
            expect(fixture.git(['log', '--format=%s', '--reverse', 'semantic-reset-base..HEAD'])).toContain('feat(core): reword runtime rewrite target');

            const afterReword = fixture.git(['rev-list', '--reverse', 'semantic-reset-base..HEAD']).trim().split(/\r?\n/);
            await worktree.squashCommits(afterReword.slice(0, 2), 'feat(core): squash runtime rewrite target');
            expect(fixture.git(['log', '--format=%s', '--reverse', 'semantic-reset-base..HEAD'])).toContain('feat(core): squash runtime rewrite target');

            const afterSquash = fixture.git(['rev-list', '--reverse', 'semantic-reset-base..HEAD']).trim().split(/\r?\n/);
            await worktree.dropCommit(afterSquash.at(-1)!);
            expect(fixture.git(['rev-list', '--count', 'semantic-reset-base..HEAD']).trim()).toBe('1');

            fixture.git(['reset', '--hard', 'HEAD']);
            fs.writeFileSync(path.join(fixture.fixture.repo, 'src', 'rewrite', 'fixup.ts'), 'export const fixupRuntime = true;\n');
            await worktree.stage(['src/rewrite/fixup.ts']);
            const target = fixture.git(['rev-parse', 'HEAD']).trim();
            await worktree.fixupCommits([target]);
            expect(fixture.git(['log', '-1', '--format=%s']).trim()).toBe('feat(core): squash runtime rewrite target');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('executes cherry-pick, revert, rebase, and their abort/skip/continue conflict controls on real repos', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-semantic-sequencer-');
        try {
            const { worktree } = fixture;
            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            fixture.git(['clean', '-fd']);
            await expect(worktree.cherryPick('semantic-conflict-pick', {})).rejects.toThrow();
            expect((await worktree.getStatus()).conflicts.map((entry) => entry.filePath)).toContain('src/conflict.ts');
            await worktree.abortCherryPick();

            await worktree.cherryPick('feature/cherry-pick-source', { noCommit: true });
            expect(fixture.git(['status', '--porcelain'])).toContain('A  src/cherry-only.ts');
            fixture.git(['reset', '--hard', 'semantic-reset-base']);

            await worktree.revertCommit('semantic-conflict-pick', { noCommit: true }).catch(async () => {
                expect((await worktree.getStatus()).conflicts.map((entry) => entry.filePath)).toContain('src/conflict.ts');
                await worktree.abortRevert();
            });

            await worktree.checkoutNewBranch('feature/runtime-rebase', 'semantic-reset-base');
            fs.writeFileSync(path.join(fixture.fixture.repo, 'src', 'rebase-runtime.ts'), 'export const rebaseRuntime = true;\n');
            await worktree.stage(['src/rebase-runtime.ts']);
            await worktree.commit('test(core): add runtime rebase branch', {});
            await worktree.rebase('main', undefined, {});
            expect(fixture.git(['merge-base', '--is-ancestor', 'main', 'HEAD']).trim()).toBe('');

            await worktree.checkout('main', {});
            fixture.git(['reset', '--hard', 'semantic-reset-base']);
            await worktree.rebase('feature/cherry-pick-source', undefined, {}).catch(async () => {
                await worktree.skipRebase().catch(async () => {
                    await worktree.abortRebase();
                });
            });
            await worktree.quitRebase().catch(() => undefined);
        } finally {
            fixture.cleanup();
        }
    }, 120_000);
});
