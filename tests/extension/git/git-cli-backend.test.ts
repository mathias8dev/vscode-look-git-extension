import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/git-repo';

describe('GitCliBackend', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    function repo(): TempGitRepo {
        const r = createTempGitRepo();
        repos.push(r);
        return r;
    }

    it('runs git commands in the configured working directory', async () => {
        const r = repo();
        const backend = new GitCliBackend(r.cwd);

        await expect(backend.run(['rev-parse', '--show-toplevel'])).resolves.toBe(`${r.cwd}\n`);
    });

    it('uses a configured git executable path', async () => {
        const r = repo();
        const gitWrapperPath = path.join(r.cwd, 'git-wrapper.sh');
        const markerPath = path.join(r.cwd, 'git-wrapper-called.txt');
        fs.writeFileSync(gitWrapperPath, [
            '#!/usr/bin/env sh',
            `printf '%s\\n' "$@" > ${JSON.stringify(markerPath)}`,
            'exec git "$@"',
            '',
        ].join('\n'));
        fs.chmodSync(gitWrapperPath, 0o755);
        const backend = new GitCliBackend(r.cwd, undefined, undefined, gitWrapperPath);

        await expect(backend.run(['rev-parse', '--show-toplevel'])).resolves.toBe(`${r.cwd}\n`);
        expect(fs.readFileSync(markerPath, 'utf8')).toContain('rev-parse');
    });

    it('merges custom environment variables into git process execution', async () => {
        const r = repo();
        const backend = new GitCliBackend(r.cwd);

        const output = await backend.run(['var', 'GIT_AUTHOR_IDENT'], {
            env: {
                GIT_AUTHOR_NAME: 'Test Author',
                GIT_AUTHOR_EMAIL: 'test-author@example.com',
                GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
            },
        });

        expect(output).toContain('Test Author <test-author@example.com>');
    });

    it('respects an already aborted signal', async () => {
        const r = repo();
        const backend = new GitCliBackend(r.cwd);
        const controller = new AbortController();
        controller.abort();

        await expect(backend.run(['status'], { signal: controller.signal })).rejects.toThrow();
    });
});
