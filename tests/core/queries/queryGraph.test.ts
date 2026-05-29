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
        const separatorIndex = args.indexOf('--');
        expect(separatorIndex).toBeGreaterThan(0);
        expect(args.indexOf('main')).toBeLessThan(separatorIndex);
        expect(args.indexOf('origin/dev')).toBeLessThan(separatorIndex);
        expect(args.slice(separatorIndex + 1)).toEqual(['src/app.ts']);
    });

    it('queries all refs by default', async () => {
        const calls: string[][] = [];
        await queryGraphLog(recordingExec(calls), 50);

        expect(expectItem(calls, 0)).toContain('--all');
    });
});
