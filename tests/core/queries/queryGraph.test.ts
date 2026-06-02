import { describe, expect, it } from 'vitest';
import type { GitExec } from '../../../src/core/git/GitRepository';
import { queryGraphLog } from '../../../src/core/queries/queryGraph';
import { expectItem } from '../../helpers/assertions';

function recordingExec(calls: string[][]): GitExec {
    return async (args) => {
        calls.push([...args]);
        return '';
    };
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
});
