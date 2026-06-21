import { describe, expect, it } from 'vitest';
import type { CommitFileChange } from '@protocol/graph/types';
import { filterCommitDetailFiles } from '@webview/features/graph/commit-details-model';

describe('commitDetailsModel', () => {
    it('filters commit detail files by path or original path', () => {
        const files: readonly CommitFileChange[] = [
            { status: 'M', filePath: 'src/app.ts' },
            { status: 'A', filePath: 'docs/README.md' },
            { status: 'R', filePath: 'src/new-name.ts', origPath: 'src/old-name.ts' },
        ];

        expect(filterCommitDetailFiles(files, '')).toBe(files);
        expect(filterCommitDetailFiles(files, 'readme')).toEqual([files[1]]);
        expect(filterCommitDetailFiles(files, 'OLD-name')).toEqual([files[2]]);
    });
});
