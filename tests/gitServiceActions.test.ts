import { describe, expect, it } from 'vitest';
import { GitService } from '../src/gitService';
import { repo, messages, expectGitFailure } from './helpers/gitServiceRuntime';

describe('GitService stash parsing', () => {
    it('detects renamed files inside a stash', async () => {
        const r = repo();
        r.write('old.txt', 'same');
        r.commit('initial');
        r.git(['mv', 'old.txt', 'new.txt']);
        r.git(['stash', 'push', '-m', 'rename stash']);

        const stashes = await r.service.stashList();
        const files = await r.service.getStashFiles(0);

        expect(stashes[0].message).toContain('rename stash');
        expect(files).toContainEqual(expect.objectContaining({
            status: 'R',
            filePath: 'new.txt',
            origPath: 'old.txt',
        }));
    });
});

describe('GitService utility methods', () => {
    it('returns the configured git user name', async () => {
        const r = repo();
        r.git(['config', 'user.name', 'My Name']);
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.getUserName()).toBe('My Name');
    });

    it('finds the oldest commit from an unordered set of hashes', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        const h1 = r.commit('first');
        r.write('b.txt', 'b');
        const h2 = r.commit('second');
        r.write('c.txt', 'c');
        const h3 = r.commit('third');

        const oldest = await r.service.findOldestCommit([h3, h1, h2]);

        expect(oldest).toBe(h1);
    });

    it('returns all tags with name and short hash', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');
        r.git(['tag', 'v1.0.0']);

        const tags = await r.service.getAllTags();

        expect(tags).toHaveLength(1);
        expect(tags[0].name).toBe('v1.0.0');
        expect(tags[0].hash).toBeTruthy();
    });

    it('returns an empty array when there are no tags', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        r.commit('initial');

        expect(await r.service.getAllTags()).toEqual([]);
    });

    it('retrieves a single commit by hash with getCommit', async () => {
        const r = repo();
        r.write('file.txt', 'content');
        const hash = r.commit('my commit');

        const commit = await r.service.getCommit(hash);

        expect(commit?.message).toBe('my commit');
        expect(commit?.hash).toBe(hash);
    });

    it('drops multiple commits in a single rebase', async () => {
        const r = repo();
        r.write('a.txt', 'a');
        r.commit('base');
        r.write('b.txt', 'b');
        const h1 = r.commit('drop one');
        r.write('c.txt', 'c');
        const h2 = r.commit('drop two');
        r.write('d.txt', 'd');
        r.commit('keep');

        await r.service.dropCommits([h1, h2]);

        expect(messages(r)).toEqual(['keep', 'base']);
    });

    it('returns the working directory path', () => {
        const r = repo();
        expect(r.service.getWorkingDirectory()).toBe(r.cwd);
    });

    it('updates the working directory via setWorkingDirectory', () => {
        const r = repo();
        r.service.setWorkingDirectory('/tmp/other');
        expect(r.service.getWorkingDirectory()).toBe('/tmp/other');
    });

    it('rejects temp repo helper writes outside the repository', () => {
        const r = repo();
        expect(() => r.write('../escape.txt', 'nope')).toThrow(/escapes temp repository/);
        expect(() => r.mkdir('../escape-dir')).toThrow(/escapes temp repository/);
    });
});

describe('GitService cherry-pick, revert, and reset', () => {
    it('cherry-picks a commit from another branch onto the current branch', async () => {
        const r = repo();
        r.write('base.txt', 'base');
        r.commit('base');
        r.git(['checkout', '-q', '-b', 'feature']);
        r.write('feature.txt', 'feature');
        const featureHash = r.commit('add feature');
        r.git(['checkout', '-q', 'main']);

        await r.service.cherryPick(featureHash);

        expect(messages(r)[0]).toBe('add feature');
        expect(r.git(['show', 'HEAD:feature.txt'])).toBe('feature');
    });

    it('reverts a commit by creating an inverse commit', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        r.commit('initial');
        r.write('file.txt', 'two');
        const toRevert = r.commit('change');

        await r.service.revert(toRevert);

        expect(messages(r)[0]).toMatch(/[Rr]evert/);
        expect(r.git(['show', 'HEAD:file.txt'])).toBe('one');
    });

    it('resets soft: keeps changes staged', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        const firstHash = r.commit('first');
        r.write('file.txt', 'two');
        r.commit('second');

        await r.service.reset(firstHash, 'soft');

        const status = await r.service.getStatus();
        expect(status.staged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
        expect(messages(r)).toEqual(['first']);
    });

    it('resets mixed: keeps changes unstaged', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        const firstHash = r.commit('first');
        r.write('file.txt', 'two');
        r.commit('second');

        await r.service.reset(firstHash, 'mixed');

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toContainEqual(expect.objectContaining({ filePath: 'file.txt' }));
        expect(messages(r)).toEqual(['first']);
    });

    it('resets hard: discards all changes', async () => {
        const r = repo();
        r.write('file.txt', 'one');
        const firstHash = r.commit('first');
        r.write('file.txt', 'two');
        r.commit('second');

        await r.service.reset(firstHash, 'hard');

        const status = await r.service.getStatus();
        expect(status.staged).toEqual([]);
        expect(status.unstaged).toEqual([]);
        expect(messages(r)).toEqual(['first']);
        expect(r.git(['show', 'HEAD:file.txt'])).toBe('one');
    });
});

