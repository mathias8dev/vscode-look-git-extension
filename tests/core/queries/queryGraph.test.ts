import { describe, expect, it } from 'vitest';
import type { GitExec } from '../../../src/core/git/git-exec';
import { queryCommitLog, queryGraphLog } from '../../../src/core/queries/queryGraph';
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
