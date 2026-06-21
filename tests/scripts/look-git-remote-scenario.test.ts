import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeDirSyncWithRetry } from '@tests/helpers/gitRepo';

const roots: string[] = [];

afterEach(() => {
    while (roots.length) {
        removeDirSyncWithRetry(roots.pop()!);
    }
});

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function lines(output: string): string[] {
    return output.split('\n').filter(Boolean);
}

function aheadBehind(cwd: string, left: string, right: string): readonly [number, number] {
    const [ahead, behind] = git(cwd, ['rev-list', '--left-right', '--count', `${left}...${right}`]).trim().split(/\s+/).map(Number);
    if (ahead === undefined || behind === undefined) {
        throw new Error(`Unable to parse ahead/behind for ${left}...${right}`);
    }
    return [ahead, behind];
}

describe('lookGit remote setup scenario', () => {
    it('creates realistic local and remote branch states', () => {
        const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-remote-scenario-'));
        roots.push(outputRoot);

        execFileSync('node', [
            path.join(process.cwd(), 'scripts', 'look-git.ts'),
            'setup',
            'remote',
            '--output',
            outputRoot,
        ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        const repo = path.join(outputRoot, 'remote');

        expect(fs.existsSync(repo)).toBe(true);
        expect(fs.existsSync(path.join(outputRoot, '.remotes', 'origin.git'))).toBe(true);
        expect(fs.existsSync(path.join(outputRoot, '.remotes', 'upstream.git'))).toBe(true);
        expect(lines(git(repo, ['remote'])).sort()).toEqual(['origin', 'upstream']);

        const remoteBranches = lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']));
        expect(remoteBranches).toEqual(expect.arrayContaining([
            'origin/feature/remote-only-dashboard',
            'origin/docs/remote-only-guide',
            'origin/feature/diverged',
            'origin/feat/local-ahead',
            'origin/release/2.0',
            'upstream/feature/upstream-review',
            'upstream/release/upstream-sync',
        ]));

        const localBranches = lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']));
        expect(localBranches).toEqual(expect.arrayContaining([
            'main',
            'feature/shared-tracking',
            'feature/diverged',
            'feat/local-ahead',
            'release/2.0',
            'docs/local-only-runbook',
            'experiment/unpublished-graph',
        ]));
        expect(localBranches).not.toContain('feature/remote-only-dashboard');
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim()).toBe('origin/main');
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'feature/shared-tracking@{u}']).trim()).toBe('origin/feature/shared-tracking');
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'feat/local-ahead@{u}']).trim()).toBe('origin/feat/local-ahead');

        expect(aheadBehind(repo, 'feature/diverged', 'origin/feature/diverged')).toEqual([1, 1]);
        expect(aheadBehind(repo, 'feat/local-ahead', 'origin/feat/local-ahead')).toEqual([2, 0]);
        expect(aheadBehind(repo, 'release/2.0', 'origin/release/2.0')).toEqual([0, 1]);

        const authors = new Set(lines(git(repo, ['log', '--branches', '--remotes', '--format=%an'])));
        expect(authors.size).toBeGreaterThanOrEqual(4);
        const messages = lines(git(repo, ['log', '--branches', '--remotes', '--format=%s']));
        expect(messages.length).toBeGreaterThanOrEqual(40);
        expect(messages.every((message) => /^(feat|fix|refactor|test|docs|build|chore)\([^)]+\): .+/.test(message))).toBe(true);

        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(graph): stash remote fixture note');
        const status = git(repo, ['status', '--porcelain', '-uall']);
        expect(status).toContain('A  src/remote/staged-local.ts');
        expect(status).toContain(' M README.md');
        expect(status).toContain('?? notes/remote-local.md');
    }, 120_000); // heavy: spawns look-git.ts which runs dozens of git subprocesses (slow on Windows runners)
});
