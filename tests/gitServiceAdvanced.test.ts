import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../src/gitService';
import {
    createConflictWorkflowFixture,
    createEdgeFilesFixture,
    createLargeHistoryFixture,
    createRemoteWorkflowFixture,
    createRichHistoryFixture,
    createTempGitRepo,
    type RemoteWorkflowFixture,
    type TempGitRepo,
} from './helpers/gitRepo';

const repos: TempGitRepo[] = [];
const remotes: RemoteWorkflowFixture[] = [];
const tempDirs: string[] = [];

function repo(): TempGitRepo {
    const r = createTempGitRepo();
    repos.push(r);
    return r;
}

afterEach(() => {
    while (repos.length > 0) {
        repos.pop()!.cleanup();
    }
    while (remotes.length > 0) {
        remotes.pop()!.cleanup();
    }
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('GitService advanced fixture coverage', () => {
    it('loads a rich fixture with 100+ commits, many authors, branches, tags, renames, deletes, and dirty state', async () => {
        const fixture = createRichHistoryFixture({ commitCount: 120, dirty: true });
        repos.push(fixture.repo);

        const commitCount = Number(fixture.repo.gitTrim(['rev-list', '--count', '--all']));
        const authors = new Set(fixture.repo.gitTrim(['log', '--all', '--format=%ae']).split('\n').filter(Boolean));
        const branches = await fixture.repo.service.getAllBranches();
        const tags = await fixture.repo.service.getAllTags();
        const status = await fixture.repo.service.getStatus();

        expect(commitCount).toBeGreaterThanOrEqual(100);
        expect(authors.size).toBeGreaterThanOrEqual(10);
        expect(branches.length).toBeGreaterThanOrEqual(8);
        expect(tags.map((tag) => tag.name)).toEqual(expect.arrayContaining(['v1.0.0', 'fixture-rich-history']));
        expect(status.unstaged.some((entry) => entry.filePath === 'src/dirty.txt')).toBe(true);
        expect(fixture.repo.gitTrim(['log', '--all', '--name-status', '--format=']).split('\n')).toEqual(
            expect.arrayContaining([
                expect.stringMatching(/^R\d+\s+src\/core\.ts\s+src\/core-renamed\.ts$/),
                'D\tsrc/root.txt',
            ]),
        );
    });

    it('reads a 1000 commit history without truncating requested log and graph windows', async () => {
        const large = createLargeHistoryFixture(1000);
        repos.push(large);

        await expect(large.service.getLog(50, 0)).resolves.toHaveLength(50);
        await expect(large.service.getGraphLog(300)).resolves.toHaveLength(300);
    }, 120_000);
});

describe('GitService remote workflows with local bare remotes', () => {
    function remoteFixture(): RemoteWorkflowFixture {
        const fixture = createRemoteWorkflowFixture();
        remotes.push(fixture);
        return fixture;
    }

    it('uses a local bare remote and preserves upstream tracking information', async () => {
        const fixture = remoteFixture();

        expect(fixture.remote.gitTrim(['rev-parse', '--is-bare-repository'])).toBe('true');
        expect(await fixture.local.service.getRemotes()).toEqual(['origin']);
        expect(await fixture.local.service.getTrackingBranch()).toEqual({ remote: 'origin', branch: 'main' });
    });

    it('fetches a remote branch whose name contains slashes from the bare remote', async () => {
        const fixture = remoteFixture();

        await fixture.local.service.fetchBranch('origin', 'feature/nested');

        expect(fixture.local.gitTrim(['rev-parse', 'origin/feature/nested'])).toBe(
            fixture.seed.gitTrim(['rev-parse', 'feature/nested']),
        );
    });

    it('checks out a remote graph branch as a local tracking branch instead of detached HEAD', async () => {
        const fixture = remoteFixture();

        await fixture.local.service.checkoutRemoteBranch('origin/feature/nested');

        expect(fixture.local.gitTrim(['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('feature/nested');
        expect(fixture.local.gitTrim(['rev-parse', 'HEAD'])).toBe(
            fixture.local.gitTrim(['rev-parse', 'origin/feature/nested']),
        );
        expect(await fixture.local.service.getTrackingBranch()).toEqual({
            remote: 'origin',
            branch: 'feature/nested',
        });
    });

    it('pushes a local branch to the bare remote and sets upstream', async () => {
        const fixture = remoteFixture();
        fixture.local.git(['checkout', '-q', 'local-only']);

        await fixture.local.service.pushBranch('origin', 'local-only');

        const remoteHeads = fixture.local.gitTrim(['ls-remote', '--heads', fixture.remotePath, 'local-only']);
        expect(remoteHeads).toContain('refs/heads/local-only');
        expect(await fixture.local.service.getTrackingBranch()).toEqual({ remote: 'origin', branch: 'local-only' });
    });

    it('surfaces push failures when the remote has advanced independently', async () => {
        const fixture = remoteFixture();
        fixture.seed.git(['checkout', '-q', 'main']);
        fixture.seed.commitFile('remote-advance.txt', 'remote\n', 'remote advance');
        fixture.seed.git(['push', '-q', 'origin', 'main']);

        fixture.local.git(['checkout', '-q', 'main']);
        fixture.local.commitFile('local-advance.txt', 'local\n', 'local advance');

        await expect(fixture.local.service.push()).rejects.toThrow();
    });

    it('lists multiple configured remotes in git order', async () => {
        const fixture = remoteFixture();
        fixture.local.git(['remote', 'add', 'upstream', fixture.remotePath]);

        expect(await fixture.local.service.getRemotes()).toEqual(['origin', 'upstream']);
    });
});

describe('GitService special file and repository edge cases', () => {
    it.skipIf(process.platform === 'win32')('keeps unicode, special-character, CRLF, and binary paths visible in commit file lists', async () => {
        const edge = createEdgeFilesFixture();
        repos.push(edge);

        const allChangedPaths = edge.gitTrim(['log', '--name-only', '--format=', '--all'])
            .split('\n')
            .filter(Boolean);
        const latestFiles = await edge.service.getCommitFiles(edge.gitTrim(['rev-parse', 'HEAD']));

        expect(allChangedPaths.join('\n')).toContain('unicode/');
        expect(allChangedPaths).toEqual(expect.arrayContaining([
            'special/hash#query?.txt',
            'crlf.txt',
            'binary.bin',
        ]));
        expect(latestFiles.map((file) => file.filePath)).toEqual(expect.arrayContaining(['crlf.txt', 'binary.bin']));
        expect(edge.git(['show', 'HEAD:crlf.txt'])).toContain('a\r\nb\r\n');
    });

    it.skipIf(process.platform === 'win32')('records symlink paths when the OS supports symlinks', async () => {
        const r = repo();
        r.commitFile('target.txt', 'target\n', 'add target');
        fs.symlinkSync('target.txt', path.join(r.cwd, 'target-link.txt'));
        r.git(['add', 'target-link.txt']);
        r.git(['commit', '-q', '-m', 'add symlink']);

        const files = await r.service.getCommitFiles(r.gitTrim(['rev-parse', 'HEAD']));

        expect(files.map((file) => file.filePath)).toContain('target-link.txt');
    });

    it.skipIf(process.platform === 'win32')('records executable-bit changes when the OS supports executable modes', async () => {
        const r = repo();
        r.commitFile('script.sh', '#!/bin/sh\necho hi\n', 'add script');
        r.git(['update-index', '--chmod=+x', 'script.sh']);
        r.git(['commit', '-q', '-m', 'make script executable']);

        const files = await r.service.getCommitFiles(r.gitTrim(['rev-parse', 'HEAD']));

        expect(files.map((file) => file.filePath)).toContain('script.sh');
    });

    it('can operate from a linked git worktree', async () => {
        const r = repo();
        r.commitFile('file.txt', 'main\n', 'base');
        const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-worktree-'));
        tempDirs.push(worktreeDir);
        fs.rmdirSync(worktreeDir);
        r.git(['worktree', 'add', '-q', '-b', 'worktree-branch', worktreeDir]);

        const service = new GitService(worktreeDir);

        expect(await service.getCurrentBranch()).toBe('worktree-branch');
        expect(await service.getLog(1)).toHaveLength(1);
    });

    it('can list a submodule entry when file protocol submodules are supported', async () => {
        const child = repo();
        child.commitFile('child.txt', 'child\n', 'child commit');
        const parent = repo();
        parent.commitFile('parent.txt', 'parent\n', 'parent commit');

        try {
            parent.git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child.cwd, 'modules/child']);
            parent.git(['commit', '-q', '-m', 'add submodule']);
        } catch {
            console.warn('Skipping submodule assertion: local Git disallows file protocol submodules.');
            return;
        }

        const files = await parent.service.getCommitFiles(parent.gitTrim(['rev-parse', 'HEAD']));

        expect(files.map((file) => file.filePath)).toContain('modules/child');
    });
});

describe('GitService conflict fixture coverage', () => {
    it('creates a deterministic merge conflict fixture', async () => {
        const conflict = createConflictWorkflowFixture();
        repos.push(conflict);

        conflict.git(['checkout', '-q', 'main']);
        expect(() => conflict.git(['merge', 'incoming'])).toThrow();

        const status = await conflict.service.getStatus();

        expect(status.conflictState).toBe('merge');
        expect(status.conflicts.map((entry) => entry.filePath)).toContain('conflict.txt');
    });
});
