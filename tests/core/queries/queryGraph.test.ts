import { describe, expect, it } from 'vitest';
import type { GitExec } from '../../../src/core/git/git-exec';
import { queryCommitLineRangeLog, queryCommitLog, queryGraphLog } from '../../../src/core/queries/queryGraph';
import { LOG_FIELD_SEP, LOG_RECORD_SEP } from '../../../src/core/parsing/parseLog';
import { expectItem } from '../../helpers/assertions';

function recordingExec(calls: string[][]): GitExec {
    return async (args) => {
        calls.push([...args]);
        return '';
    };
}

function failingExec(error: Error): GitExec {
    return async () => {
        throw error;
    };
}

function gitError(message: string, stderr = message): Error {
    return Object.assign(new Error(message), { stderr });
}

function graphRecord(
    hash: string,
    message: string,
    authorName = 'Ada Lovelace',
    authorEmail = 'ada@example.com',
    parentHashes: readonly string[] = [],
): string {
    return [
        hash,
        hash.slice(0, 7),
        message,
        authorName,
        authorEmail,
        '2026-01-01T00:00:00Z',
        parentHashes.join(' '),
        '',
    ].join(LOG_FIELD_SEP) + LOG_RECORD_SEP;
}

describe('queryGraphLog', () => {
    it('passes branch filters as revisions before path filters', async () => {
        const calls: string[][] = [];
        await queryGraphLog(recordingExec(calls), 50, ['main', 'origin/dev'], 'src/app.ts');

        const args = expectItem(calls, 0);
        expect(args).toContain('--parents');
        const separatorIndex = args.indexOf('--');
        expect(separatorIndex).toBeGreaterThan(0);
        expect(args.indexOf('main')).toBeLessThan(separatorIndex);
        expect(args.indexOf('origin/dev')).toBeLessThan(separatorIndex);
        expect(args.slice(separatorIndex + 1)).toEqual(['src/app.ts']);
    });

    it('queries branch, tag, remote refs and HEAD by default without stash internals', async () => {
        const calls: string[][] = [];
        await queryGraphLog(recordingExec(calls), 50);

        const args = expectItem(calls, 0);
        expect(args).toContain('HEAD');
        expect(args).toContain('--branches');
        expect(args).toContain('--tags');
        expect(args).toContain('--remotes');
        expect(args).not.toContain('--all');
    });

    it('passes graph pagination skip to git log', async () => {
        const calls: string[][] = [];
        await queryGraphLog(recordingExec(calls), 50, undefined, undefined, { skip: 150 });

        const args = expectItem(calls, 0);
        expect(args).toContain('--max-count=50');
        expect(args).toContain('--skip=150');
    });

    it('retries the default graph without HEAD when HEAD does not exist yet', async () => {
        const calls: string[][] = [];
        let callCount = 0;
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (callCount++ === 0) {
                throw gitError(
                    "Command failed: git log HEAD\nfatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
                );
            }
            return '';
        };

        await expect(queryGraphLog(exec, 50)).resolves.toEqual([]);

        expect(calls).toHaveLength(2);
        expect(expectItem(calls, 0)).toContain('HEAD');
        expect(expectItem(calls, 1)).not.toContain('HEAD');
        expect(expectItem(calls, 1)).toContain('--remotes');
    });

    it('does not hide missing explicit branch errors', async () => {
        await expect(queryGraphLog(failingExec(gitError(
            "fatal: ambiguous argument 'missing': unknown revision or path not in the working tree.",
        )), 50, ['missing'])).rejects.toThrow('missing');
    });

    it('throws when the fallback without HEAD also fails', async () => {
        await expect(queryGraphLog(failingExec(gitError(
            "Command failed: git log HEAD\nfatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
        )), 50)).rejects.toThrow('HEAD');
    });

    it('uses native message candidates without scanning unrelated commits', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (args.includes('--grep=ada')) {
                return graphRecord('3333333', 'Match ada in message', 'Grace Hopper', 'grace@example.com');
            }
            return graphRecord('1111111', 'Plain commit', 'Ada Lovelace', 'lovelace@example.com');
        };

        const commits = await queryGraphLog(exec, 20, undefined, undefined, { search: 'ada' });

        expect(calls).toHaveLength(1);
        expect(calls.some((args) => args.includes('--regexp-ignore-case') && args.includes('--grep=ada'))).toBe(true);
        expect(calls.some((args) => args.some((arg) => arg.startsWith('--author=')))).toBe(false);
        expect(expectItem(calls, 0)).toContain('--max-count=40');
        expect(commits.map((commit) => commit.hash)).toEqual(['3333333']);
        expect(commits.every((commit) => commit.matchesFilter)).toBe(true);
    });

    it('returns native message candidates beyond the bounded context for unfiltered searches', async () => {
        const exec: GitExec = async (args) => {
            if (args.includes('--grep=needle')) {
                return graphRecord('7777777', 'Deep needle match', 'Grace Hopper', 'grace@example.com');
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, undefined, undefined, { search: 'needle' });

        expect(commits.map((commit) => commit.hash)).toEqual(['7777777']);
        expect(expectItem(commits, 0).matchesFilter).toBe(true);
    });

    it('keeps native message pagination inside explicit branch filters', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (args.includes('--grep=needle')) {
                return graphRecord('7777777', 'Deep needle match', 'Grace Hopper', 'grace@example.com');
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, ['main'], undefined, { search: 'needle' });

        const grepCall = calls.find((args) => args.includes('--grep=needle'));
        expect(grepCall).toBeDefined();
        expect(grepCall).toContain('main');
        expect(commits.map((commit) => commit.hash)).toEqual(['7777777']);
    });

    it('looks up hash-like searches directly', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (args.includes('abc1234^{commit}')) {
                return graphRecord('abc123499999', 'Direct hash hit', 'Grace Hopper', 'grace@example.com');
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, undefined, undefined, { search: 'abc1234' });

        expect(calls.some((args) => args.includes('abc1234^{commit}'))).toBe(true);
        expect(commits.map((commit) => commit.hash)).toEqual(['abc123499999']);
        expect(expectItem(commits, 0).matchesFilter).toBe(true);
    });

    it('keeps direct hash matches before message matches', async () => {
        const exec: GitExec = async (args) => {
            if (args.includes('abc1234^{commit}')) {
                return graphRecord('abc123499999', 'Direct hash hit', 'Grace Hopper', 'grace@example.com');
            }
            if (args.includes('--grep=abc1234')) {
                return graphRecord('1111111', 'Message abc1234 hit', 'Grace Hopper', 'grace@example.com');
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 1, undefined, undefined, { search: 'abc1234' });

        expect(commits.map((commit) => commit.hash)).toEqual(['abc123499999']);
    });

    it('validates direct hash matches against branch filters', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (args.includes('abc1234^{commit}')) {
                return graphRecord('abc123499999', 'Direct hash hit', 'Grace Hopper', 'grace@example.com');
            }
            if (args[0] === 'merge-base' && args.includes('main')) {
                return '';
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, ['main'], undefined, { search: 'abc1234' });

        expect(calls).toContainEqual(['merge-base', '--is-ancestor', 'abc123499999', 'main']);
        expect(commits.map((commit) => commit.hash)).toEqual(['abc123499999']);
    });

    it('drops direct hash matches outside branch filters', async () => {
        const exec: GitExec = async (args) => {
            if (args.includes('abc1234^{commit}')) {
                return graphRecord('abc123499999', 'Direct hash hit', 'Grace Hopper', 'grace@example.com');
            }
            if (args[0] === 'merge-base') {
                throw gitError('not ancestor', '');
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, ['main'], undefined, { search: 'abc1234' });

        expect(commits).toEqual([]);
    });

    it('validates direct hash matches against author date and path filters', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (args.includes('abc1234^{commit}')) {
                return graphRecord('abc123499999', 'Direct hash hit', 'Ada Lovelace', 'ada@example.com');
            }
            if (args.includes('abc123499999') && args.includes('--author=Ada')) {
                return 'abc123499999';
            }
            return '';
        };

        const commits = await queryGraphLog(exec, 20, undefined, 'src/app.ts', {
            search: 'abc1234',
            authors: ['Ada'],
            dateFrom: '2026-01-01',
            dateTo: '2026-01-31',
        });

        const validationCall = calls.find((args) => args.includes('abc123499999') && args.includes('--author=Ada'));
        expect(validationCall).toBeDefined();
        expect(validationCall).toContain('--since=2026-01-01T00:00:00');
        expect(validationCall).toContain('--until=2026-01-31T23:59:59');
        expect(validationCall?.slice(-2)).toEqual(['--', 'src/app.ts']);
        expect(commits.map((commit) => commit.hash)).toEqual(['abc123499999']);
    });

    it('continues native message search until enough visible subjects match', async () => {
        const calls: string[][] = [];
        const exec: GitExec = async (args) => {
            calls.push([...args]);
            if (!args.includes('--grep=needle')) { return ''; }
            if (args.includes('--skip=4')) {
                return graphRecord('5555555', 'Second visible needle match', 'Grace Hopper', 'grace@example.com');
            }
            return graphRecord('1111111', 'Body-only candidate one', 'Grace Hopper', 'grace@example.com')
                + graphRecord('2222222', 'Body-only candidate two', 'Grace Hopper', 'grace@example.com')
                + graphRecord('3333333', 'First visible needle match', 'Grace Hopper', 'grace@example.com')
                + graphRecord('4444444', 'Body-only candidate three', 'Grace Hopper', 'grace@example.com');
        };

        const commits = await queryGraphLog(exec, 2, undefined, undefined, { search: 'needle' });

        expect(calls.some((args) => args.includes('--grep=needle') && args.includes('--skip=4'))).toBe(true);
        expect(commits.map((commit) => commit.hash)).toEqual(['3333333', '5555555']);
    });
});

describe('queryCommitLog', () => {
    it('passes the selected ref after pagination arguments', async () => {
        const calls: string[][] = [];
        await queryCommitLog(recordingExec(calls), 25, 50, 'feature/history');

        const args = expectItem(calls, 0);
        expect(args).toContain('--max-count=25');
        expect(args).toContain('--skip=50');
        expect(args.at(-1)).toBe('feature/history');
    });

    it('passes the selected path after the revision separator', async () => {
        const calls: string[][] = [];
        await queryCommitLog(recordingExec(calls), 25, 50, 'feature/history', 'src/app.ts');

        const args = expectItem(calls, 0);
        expect(args).toEqual(expect.arrayContaining(['feature/history', '--', 'src/app.ts']));
        expect(args.indexOf('--')).toBeGreaterThan(args.indexOf('feature/history'));
    });

    it('returns an empty history when the current branch has no commits yet', async () => {
        await expect(queryCommitLog(failingExec(gitError(
            "Command failed: git log\nfatal: your current branch 'main' does not have any commits yet",
        )), 25, 0)).resolves.toEqual([]);
    });

    it('returns an empty history when explicit HEAD has no commit yet', async () => {
        await expect(queryCommitLog(failingExec(gitError(
            "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
        )), 25, 0, 'HEAD')).resolves.toEqual([]);
    });

    it('does not hide invalid selected refs', async () => {
        await expect(queryCommitLog(failingExec(gitError(
            "fatal: ambiguous argument 'feature/missing': unknown revision or path not in the working tree.",
        )), 25, 0, 'feature/missing')).rejects.toThrow('feature/missing');
    });
});

describe('queryCommitLineRangeLog', () => {
    it('uses metadata-only line range history arguments', async () => {
        const calls: string[][] = [];
        await queryCommitLineRangeLog(recordingExec(calls), 25, 50, 'src/app.ts', 3, 8);

        const args = expectItem(calls, 0);
        expect(args).toEqual(expect.arrayContaining([
            'log',
            '--no-patch',
            '--max-count=25',
            '--skip=50',
            '-L',
            '3,8:src/app.ts',
        ]));
        expect(args.indexOf('--no-patch')).toBeLessThan(args.indexOf('-L'));
    });

    it('returns an empty history when line range history has no commits yet', async () => {
        await expect(queryCommitLineRangeLog(failingExec(gitError(
            "fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.",
        )), 25, 0, 'src/app.ts', 3, 8)).resolves.toEqual([]);
    });
});
