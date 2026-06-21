import { afterEach, describe, expect, it } from 'vitest';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { createTempGitRepo, type TempGitRepo } from '@tests/helpers/gitRepo';

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
