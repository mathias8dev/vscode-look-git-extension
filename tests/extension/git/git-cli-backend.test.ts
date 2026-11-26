import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GitCliBackend } from '@extension/git/git-cli-backend';
import { GitOutputFormat } from '@application/ports/git-output-format';
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

    it('preserves non-UTF-8 bytes and reads files larger than the former 10 MiB limit', async () => {
        const r = repo();
        const content = Buffer.alloc(12 * 1024 * 1024, 0xff);
        content.set(Buffer.from([0xff, 0xfe, 0, 0, 0x80, 0xe9]), 0);
        r.writeBuffer('large.bin', content);
        r.commit('Large binary');
        const backend = new GitCliBackend(r.cwd);

        const bytes = await backend.run(['show', 'HEAD:large.bin'], { outputFormat: GitOutputFormat.Bytes });
        expect(Buffer.from(bytes).equals(content)).toBe(true);
        const text = await backend.run(['show', 'HEAD:large.bin']);
        expect(text.length).toBeGreaterThan(10 * 1024 * 1024);
    });

    it('preserves Git failure codes and stderr for existing error classification', async () => {
        const r = repo();
        await expect(new GitCliBackend(r.cwd).run(['show', 'missing:path'], { outputFormat: GitOutputFormat.Bytes }))
            .rejects.toMatchObject({ code: 128, stderr: expect.stringContaining('fatal:') });
    });

    it('cancels a running streamed read', async () => {
        const r = repo();
        const wrapper = path.join(r.cwd, 'slow-git.js');
        fs.writeFileSync(wrapper, "process.stdout.write('started'); setInterval(() => process.stdout.write('chunk'), 20);\n");
        const controller = new AbortController();
        const operation = new GitCliBackend(r.cwd, undefined, wrapper).run(['show'], { outputFormat: GitOutputFormat.Bytes, signal: controller.signal });
        setTimeout(() => controller.abort(), 150);
        await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
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
        const backend = new GitCliBackend(r.cwd, undefined, gitWrapperPath);

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
