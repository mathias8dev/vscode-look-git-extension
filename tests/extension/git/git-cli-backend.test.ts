import { afterEach, describe, expect, it, vi } from 'vitest';
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
        const gitWrapperPath = path.join(r.cwd, 'git-wrapper.js');
        const markerPath = path.join(r.cwd, 'git-wrapper-called.txt');
        fs.writeFileSync(gitWrapperPath, [
            '#!/usr/bin/env node',
            "const childProcess = require('node:child_process');",
            "const fs = require('node:fs');",
            `fs.writeFileSync(${JSON.stringify(markerPath)}, process.argv.slice(2).join('\\n'));`,
            "const result = childProcess.spawnSync('git', process.argv.slice(2), { stdio: 'inherit' });",
            'process.exitCode = result.status ?? 1;',
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

    it('cancels a lock retry without waiting for its delay to end', async () => {
        const r = repo();
        r.write('file.txt', 'content\n');
        fs.writeFileSync(path.join(r.cwd, '.git', 'index.lock'), '');
        const controller = new AbortController();
        const originalSetTimeout = globalThis.setTimeout;
        let notifyRetry: (() => void) | undefined;
        const retryStarted = new Promise<void>((resolve) => { notifyRetry = resolve; });
        let releaseRetry: (() => void) | undefined;
        const timerSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
            if (delay !== 80) { return originalSetTimeout(callback, delay, ...args); }
            const timer = originalSetTimeout(callback, 60_000, ...args);
            releaseRetry = () => { clearTimeout(timer); callback(...args); };
            notifyRetry?.();
            return timer;
        });
        let failure: unknown;
        const operation = new GitCliBackend(r.cwd).run(['add', '--', 'file.txt'], { signal: controller.signal })
            .catch((error: unknown) => { failure = error; });

        try {
            await retryStarted;
            controller.abort();
            await new Promise<void>((resolve) => setImmediate(resolve));

            expect(failure).toMatchObject({ name: 'AbortError' });
        } finally {
            releaseRetry?.();
            timerSpy.mockRestore();
            await operation;
        }
    });
});
