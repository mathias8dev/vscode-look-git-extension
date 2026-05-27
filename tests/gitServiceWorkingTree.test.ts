import { describe, expect, it } from 'vitest';
import { GitService } from '../src/gitService';
import { repo, messages } from './helpers/gitServiceRuntime';

describe('GitService commit operations', () => {
    it('creates a new commit with the given message', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');
        r.git(['add', 'file.txt']);

        await r.service.commit('second commit');

        expect(messages(r)[0]).toBe('second commit');
    });

    it('amends the last commit message', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('wrong message');

        await r.service.commitAmend('correct message');

        expect(messages(r)[0]).toBe('correct message');
    });

    it('reports uncommitted changes when the working tree is dirty', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');

        expect(await r.service.hasUncommittedChanges()).toBe(true);
    });

    it('reports no uncommitted changes on a clean repo', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');

        expect(await r.service.hasUncommittedChanges()).toBe(false);
    });

    it('returns the full commit message via getCommitMessage', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        const hash = r.commit('specific message');

        const msg = await r.service.getCommitMessage(hash);

        expect(msg.trim()).toBe('specific message');
    });
});

describe('GitService staging and working tree operations', () => {
    it('stages a specific file', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');

        await r.service.stageFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.staged).toContainEqual(expect.objectContaining({ filePath: 'file.txt', indexStatus: 'M' }));
        expect(status.unstaged.map((e) => e.filePath)).not.toContain('file.txt');
    });

    it('unstages a staged file back to unstaged', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');
        r.git(['add', 'file.txt']);

        await r.service.unstageFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
    });

    it('stages all modified files with stageAll', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.write('b.txt', 'b');
        r.commit('initial');
        r.write('a.txt', 'aa');
        r.write('b.txt', 'bb');

        await r.service.stageAll();

        const status = await r.service.getStatus();
        expect(status.staged.map((e) => e.filePath).sort()).toEqual(['a.txt', 'b.txt']);
        expect(status.unstaged).toEqual([]);
    });

    it('unstages all staged files with unstageAll', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.write('b.txt', 'b');
        r.commit('initial');
        r.write('a.txt', 'aa');
        r.write('b.txt', 'bb');
        r.git(['add', '-A']);

        await r.service.unstageAll();

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged.map((e) => e.filePath).sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('unstages newly added files with unstageAll', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('initial');
        r.write('new-file.txt', 'new');
        r.git(['add', '-A']);

        await r.service.unstageAll();

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'new-file.txt' }));
    });

    it('falls back to reset when restore --staged fails while unstaging', async () => {
        const calls: string[][] = [];
        class FallbackGitService extends GitService {
            public override async exec(args: string[]): Promise<string> {
                calls.push(args);
                if (args[0] === 'restore') {
                    throw new Error('restore failed');
                }
                return 'ok';
            }
        }

        const service = new FallbackGitService('/tmp');
        await service.unstageFile('a.txt');
        await service.unstageAll();

        expect(calls).toEqual([
            ['restore', '--staged', '--', 'a.txt'],
            ['reset', '-q', 'HEAD', '--', 'a.txt'],
            ['restore', '--staged', '.'],
            ['reset', '-q', 'HEAD', '--', '.'],
        ]);
    });

    it('discards a tracked file modification', async () => {
        const r = repo();
        r.write('file.txt', 'original');
        r.commit('initial');
        r.write('file.txt', 'modified');

        await r.service.discardFile('file.txt');

        const status = await r.service.getStatus();
        expect(status.unstaged).toEqual([]);
    });

    it('discards an untracked file using clean fallback', async () => {
        const r = repo();
        r.write('tracked.txt', 'content');
        r.commit('initial');
        r.write('untracked.txt', 'new');

        await r.service.discardFile('untracked.txt');

        const status = await r.service.getStatus();
        expect(status.unstaged.map((e) => e.filePath)).not.toContain('untracked.txt');
    });
});

describe.sequential('GitService interactive history rewrites', () => {
    it('renames the root commit without requiring sed or a shell editor', async () => {
        const r = repo();
        r.write('root.txt', 'root');
        const rootHash = r.commit('root message');

        await r.service.renameCommit(rootHash, 'renamed root');

        expect(messages(r)[0]).toBe('renamed root');
    });

    it('drops a middle commit and leaves surrounding commits intact', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('one');
        r.write('file.txt', 'two');
        const middleHash = r.commit('two');
        r.write('other.txt', 'three');
        r.commit('three');

        await r.service.dropCommit(middleHash);

        expect(messages(r)).toEqual(['three', 'one']);
        expect(r.git(['show', 'HEAD:file.txt'])).toBe('one');
    });

    it('fixes up a child commit into its parent', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.write('feature.txt', 'parent\n');
        const parentHash = r.commit('parent');
        r.write('fix.txt', 'fix\n');
        const fixHash = r.commit('fix me');

        await r.service.fixupCommit(fixHash, parentHash);

        expect(messages(r)).toEqual(['parent', 'base']);
        expect(r.git(['show', 'HEAD:fix.txt'])).toBe('fix\n');
    });

    it('squashes consecutive commits into the oldest selected commit', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.write('one.txt', 'one');
        const oldestHash = r.commit('oldest selected');
        r.write('two.txt', 'two');
        const newestHash = r.commit('newest selected');

        await r.service.squashCommits(oldestHash, [newestHash]);

        expect(messages(r)).toEqual(['oldest selected', 'base']);
        expect(r.git(['show', 'HEAD:one.txt'])).toBe('one');
        expect(r.git(['show', 'HEAD:two.txt'])).toBe('two');
    });
});
