import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizePathForCompare, removeDirSyncWithRetry } from '../helpers/gitRepo';

const roots: string[] = [];

afterEach(() => {
    while (roots.length) {
        removeDirSyncWithRetry(roots.pop()!);
    }
});

function git(cwd: string, args: readonly string[]): string {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitWithEnv(cwd: string, args: readonly string[], env: Record<string, string>): string {
    return execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
    });
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

function aheadBehind(cwd: string, left: string, right: string): readonly [number, number] {
    const [ahead, behind] = git(cwd, ['rev-list', '--left-right', '--count', `${left}...${right}`]).trim().split(/\s+/).map(Number);
    if (ahead === undefined || behind === undefined) {
        throw new Error(`Unable to parse ahead/behind for ${left}...${right}`);
    }
    return [ahead, behind];
}

function expectSamePath(actual: string, expected: string): void {
    expect(normalizePathForCompare(actual)).toBe(normalizePathForCompare(expected));
}

function setupScenario(name: string): { readonly outputRoot: string; readonly repo: string } {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), `look-git-${name}-scenario-`));
    roots.push(outputRoot);

    execFileSync('node', [
        path.join(process.cwd(), 'scripts', 'look-git.ts'),
        'setup',
        name,
        '--output',
        outputRoot,
    ], { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

    return { outputRoot, repo: path.join(outputRoot, name) };
}

function resolveConflict(cwd: string, filePath: string, content: string, expectNextConflict: boolean): void {
    fs.writeFileSync(path.join(cwd, filePath), content);
    git(cwd, ['add', filePath]);
    if (expectNextConflict) {
        expect(() => git(cwd, ['-c', 'core.editor=true', 'rebase', '--continue'])).toThrow();
    } else {
        git(cwd, ['-c', 'core.editor=true', 'rebase', '--continue']);
    }
}

describe('lookGit special state setup scenarios', () => {
    it('creates an unborn empty repository fixture', () => {
        const { repo } = setupScenario('empty-repo');

        expect(fs.existsSync(repo)).toBe(true);
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('main');
        expect(gitSucceeds(repo, ['rev-parse', '--verify', 'HEAD'])).toBe(false);
        expect(git(repo, ['rev-list', '--all', '--count']).trim()).toBe('0');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('A  README.md');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('?? notes/first-commit-plan.md');
    });

    it('creates a remote-only fixture without a local HEAD commit', () => {
        const { repo } = setupScenario('remote-only');

        expect(fs.existsSync(repo)).toBe(true);
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
        const { repo } = setupScenario('unpublished-branch');

        expect(fs.existsSync(repo)).toBe(true);
        expect(lines(git(repo, ['remote']))).toEqual(['origin']);
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('feature/not-published');
        expect(gitSucceeds(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).toBe(false);
        expect(git(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim()).toBe('origin/main');
        expect(Number(git(repo, ['rev-list', '--count', 'origin/main..feature/not-published']).trim())).toBeGreaterThanOrEqual(2);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('?? notes/not-published-local.md');
    });

    it('creates a remote-unavailable fixture with stale fetched refs', () => {
        const { repo } = setupScenario('remote-unavailable');

        expect(fs.existsSync(repo)).toBe(true);
        expect(lines(git(repo, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']))).toEqual(expect.arrayContaining([
            'origin/main',
            'origin/feature/remote-review',
        ]));
        expect(git(repo, ['remote', 'get-url', 'origin'])).toContain('missing-origin.git');
        expect(gitSucceeds(repo, ['fetch', 'origin'])).toBe(false);
        expect(Number(git(repo, ['rev-list', '--count', 'origin/main..main']).trim())).toBeGreaterThanOrEqual(1);
    });

    it('creates a stash-pop fixture blocked by local changes', () => {
        const { repo } = setupScenario('stash-pop-blocked');

        expect(fs.existsSync(repo)).toBe(true);
        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(changes): blocked stash pop fixture');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain(' M src/app.ts');
        expect(gitSucceeds(repo, ['stash', 'pop', 'stash@{0}'])).toBe(false);
        expect(git(repo, ['stash', 'list', '--format=%s'])).toContain('wip(changes): blocked stash pop fixture');
    });

    it('creates a file-context-menu fixture with clicked-file repositories', () => {
        const { repo } = setupScenario('file-context-menu');
        const historyTarget = path.join(repo, 'repos', 'history-target');
        const pullConflictTarget = path.join(repo, 'repos', 'pull-conflict-target');

        expect(fs.existsSync(repo)).toBe(true);
        expectSamePath(git(repo, ['rev-parse', '--show-toplevel']).trim(), repo);
        expectSamePath(git(historyTarget, ['rev-parse', '--show-toplevel']).trim(), historyTarget);
        expectSamePath(git(pullConflictTarget, ['rev-parse', '--show-toplevel']).trim(), pullConflictTarget);
        expect(git(historyTarget, ['log', '--format=%s', '--', 'src/app.ts'])).toContain('feat(context): update file history target');
        expect(git(historyTarget, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', 'main@{u}']).trim()).toBe('origin/main');
        expect(aheadBehind(historyTarget, 'main', 'origin/main')).toEqual([1, 0]);
        expect(aheadBehind(pullConflictTarget, 'main', 'origin/main')).toEqual([1, 1]);
        expect(gitSucceeds(pullConflictTarget, ['pull', '--no-rebase'])).toBe(false);
        expect(git(pullConflictTarget, ['status', '--porcelain', '-uall'])).toContain('UU src/app.ts');
    });

    it('creates an interactive rebase fixture with multiple sequential conflicts', () => {
        const { repo } = setupScenario('interactive-rebase-conflicts');

        expect(fs.existsSync(repo)).toBe(true);
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('feature/interactive-rebase-conflicts');
        expect(git(repo, ['status', '--porcelain', '-uall'])).toBe('');
        expect(Number(git(repo, ['rev-list', '--count', 'main..feature/interactive-rebase-conflicts']).trim())).toBeGreaterThanOrEqual(6);
        expect(Number(git(repo, ['rev-list', '--count', 'feature/interactive-rebase-conflicts..main']).trim())).toBeGreaterThanOrEqual(5);

        expect(() => gitWithEnv(repo, ['rebase', '-i', 'main'], { GIT_SEQUENCE_EDITOR: 'true' })).toThrow();
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('UU src/app.ts');

        resolveConflict(repo, 'src/app.ts', 'export const appState = "resolved-app";\n', true);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('UU src/settings.ts');

        resolveConflict(repo, 'src/settings.ts', 'export const settingsMode = "resolved-settings";\n', true);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toContain('UU src/api.ts');

        resolveConflict(repo, 'src/api.ts', 'export const apiEndpoint = "resolved-api";\n', false);
        expect(git(repo, ['status', '--porcelain', '-uall'])).toBe('');
        expect(git(repo, ['branch', '--show-current']).trim()).toBe('feature/interactive-rebase-conflicts');
    });
});
