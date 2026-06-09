import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { removeDirSyncWithRetry } from '../helpers/gitRepo';

const roots: string[] = [];

afterEach(() => {
    while (roots.length) {
        removeDirSyncWithRetry(roots.pop()!);
    }
});

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitSucceeds(cwd: string, args: readonly string[]): boolean {
    try {
        git(cwd, args);
        return true;
    } catch {
        return false;
    }
}

function lines(output: string): string[] {
    return output.split('\n').filter(Boolean);
}

function setupScenario(name: string): { readonly outputRoot: string; readonly repo: string; readonly stdout: string } {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), `look-git-${name}-scenario-`));
    roots.push(outputRoot);

    const stdout = execFileSync('node', [
        path.join(process.cwd(), 'scripts', 'look-git.ts'),
        'setup',
        name,
        '--output',
        outputRoot,
    ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    return { outputRoot, repo: path.join(outputRoot, name), stdout };
}

describe('lookGit special state setup scenarios', () => {
    it('creates an unborn empty repository fixture', () => {
        const { repo, stdout } = setupScenario('empty-repo');

        expect(stdout).toContain(`Created empty-repo: ${repo}`);
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('main');
        expect(gitSucceeds(repo, ['rev-parse', '--verify', 'HEAD'])).toBe(false);
        expect(git(repo, ['rev-list', '--all', '--count']).trim()).toBe('0');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('A  README.md');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('?? notes/first-commit-plan.md');
    });

    it('creates a remote-only fixture without a local HEAD commit', () => {
        const { repo, stdout } = setupScenario('remote-only');

        expect(stdout).toContain(`Created remote-only: ${repo}`);
        expect(gitSucceeds(repo, ['rev-parse', '--verify', 'HEAD'])).toBe(false);
        expect(lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))).toEqual([]);
        expect(lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']))).toEqual(expect.arrayContaining([
            'origin/main',
            'origin/feature/remote-review',
            'origin/release/remote-state',
        ]));
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('A  README.md');
    });

    it('creates an unpublished local branch fixture with a remote configured', () => {
        const { repo, stdout } = setupScenario('unpublished-branch');

        expect(stdout).toContain(`Created unpublished-branch: ${repo}`);
        expect(lines(git(repo, ['remote']))).toEqual(['origin']);
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('feature/not-published');
        expect(gitSucceeds(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).toBe(false);
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim()).toBe('origin/main');
        expect(Number(git(repo, ['rev-list', '--count', 'origin/main..feature/not-published']).trim())).toBeGreaterThanOrEqual(2);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('?? notes/not-published-local.md');
    });

    it('creates a remote-unavailable fixture with stale fetched refs', () => {
        const { repo, stdout } = setupScenario('remote-unavailable');

        expect(stdout).toContain(`Created remote-unavailable: ${repo}`);
        expect(lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']))).toEqual(expect.arrayContaining([
            'origin/main',
            'origin/feature/remote-review',
        ]));
        expect(git(repo, ['remote', 'get-url', 'origin'])).toContain('missing-origin.git');
        expect(gitSucceeds(repo, ['fetch', 'origin'])).toBe(false);
        expect(Number(git(repo, ['rev-list', '--count', 'origin/main..main']).trim())).toBeGreaterThanOrEqual(1);
    });

    it('creates a stash-pop fixture blocked by local changes', () => {
        const { repo, stdout } = setupScenario('stash-pop-blocked');

        expect(stdout).toContain(`Created stash-pop-blocked: ${repo}`);
        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(changes): blocked stash pop fixture');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain(' M src/app.ts');
        expect(gitSucceeds(repo, ['stash', 'pop', 'stash@{0}'])).toBe(false);
        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(changes): blocked stash pop fixture');
    });
});
