import { afterEach, expect } from 'vitest';
import { createTempGitRepo, type TempGitRepo } from './gitRepo';

const repos: TempGitRepo[] = [];

export function repo(): TempGitRepo {
    const r = createTempGitRepo();
    repos.push(r);
    return r;
}

export function messages(r: TempGitRepo): string[] {
    return r.git(['log', '--format=%s']).split('\n').filter(Boolean);
}

export function expectGitFailure(r: TempGitRepo, args: string[], expectedOutput: RegExp): void {
    try {
        r.git(args);
    } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        const output = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`;
        expect(output).toMatch(expectedOutput);
        return;
    }
    throw new Error(`Expected git ${args.join(' ')} to fail`);
}

afterEach(() => {
    while (repos.length > 0) {
        repos.pop()!.cleanup();
    }
});
