import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLookGitScenarioFixture, type LookGitScenarioFixture } from '@tests/helpers/look-git-scenario';
import { normalizePathForCompare } from '@tests/helpers/git-repo';

const fixtures: LookGitScenarioFixture[] = [];

afterEach(() => {
    while (fixtures.length) {
        const fixture = fixtures.pop();
        fixture?.cleanup();
    }
});

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function lines(output: string): string[] {
    return output.split(/\r?\n/).filter(Boolean);
}

function gitSucceeds(cwd: string, args: readonly string[]): boolean {
    try {
        git(cwd, args);
        return true;
    } catch {
        return false;
    }
}

function aheadBehind(cwd: string, left: string, right: string): readonly [number, number] {
    const [ahead, behind] = git(cwd, ['rev-list', '--left-right', '--count', `${left}...${right}`]).trim().split(/\s+/).map(Number);
    if (ahead === undefined || behind === undefined) {
        throw new Error(`Unable to parse ahead/behind for ${left}...${right}`);
    }
    return [ahead, behind];
}

describe('lookGit semantic-actions setup scenario', () => {
    it('creates real repositories for guarded semantic git operations', () => {
        const fixture = createLookGitScenarioFixture('semantic-actions');
        fixtures.push(fixture);
        const { repo, outputRoot } = fixture;

        expect(fs.existsSync(repo)).toBe(true);
        expect(fs.existsSync(path.join(outputRoot, '.semantic-actions-remotes', 'origin.git'))).toBe(true);
        expect(lines(git(repo, ['remote']))).toEqual(['origin']);
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim()).toBe('origin/main');

        expect(lines(git(repo, ['tag', '--list', 'semantic-*'])).sort()).toEqual([
            'semantic-conflict-pick',
            'semantic-local-tag',
            'semantic-reset-base',
        ]);
        expect(git(repo, ['ls-remote', '--tags', 'origin'])).toContain('refs/tags/semantic-conflict-pick');

        expect(lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']))).toEqual(expect.arrayContaining([
            'feature/cherry-pick-source',
            'feature/lease-preview',
            'feature/rewrite-stack',
            'feature/semantic-worktree',
            'main',
        ]));
        expect(aheadBehind(repo, 'main', 'origin/main')).toEqual([1, 0]);
        expect(aheadBehind(repo, 'feature/lease-preview', 'origin/feature/lease-preview')).toEqual([1, 0]);
        expect(Number(git(repo, ['rev-list', '--count', 'semantic-reset-base..feature/rewrite-stack']).trim())).toBe(3);

        const worktreeList = git(repo, ['worktree', 'list', '--porcelain']);
        const worktreePaths = worktreePathsFromPorcelain(worktreeList);
        expect(worktreeList).toContain('branch refs/heads/feature/semantic-worktree');
        expect(worktreeList).toContain('detached');
        expect(includesPath(worktreePaths, path.join(outputRoot, '.semantic-actions-worktrees', 'semantic-review'))).toBe(true);
        expect(includesPath(worktreePaths, path.join(outputRoot, '.semantic-actions-worktrees', 'semantic-detached'))).toBe(true);

        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(semantic): stash action fixture');
        const status = git(repo, ['status', '--porcelain', '--ignored', '-uall']);
        expect(status).toContain('A  src/semantic-staged.ts');
        expect(status).toContain(' M README.md');
        expect(status).toContain('?? notes/semantic-untracked.md');
        expect(status).toContain('!! build/cache.log');

        git(repo, ['reset', '-q']);
        git(repo, ['checkout', '-q', '--', 'README.md']);
        expect(gitSucceeds(repo, ['cherry-pick', 'semantic-conflict-pick'])).toBe(false);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('UU src/conflict.ts');
        git(repo, ['cherry-pick', '--abort']);
    }, 120_000);
});

function worktreePathsFromPorcelain(output: string): readonly string[] {
    return lines(output)
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length));
}

function includesPath(paths: readonly string[], expected: string): boolean {
    const normalizedExpected = normalizePathForCompare(expected);
    return paths.some((candidate) => normalizePathForCompare(candidate) === normalizedExpected);
}
