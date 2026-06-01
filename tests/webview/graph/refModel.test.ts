import { describe, expect, it } from 'vitest';
import type { BranchInfo } from '../../../src/protocol/graph/types';
import { parseRefs } from '../../../src/webview/features/graph/refModel';

function branch(name: string, isRemote: boolean): BranchInfo {
    return {
        name,
        isRemote,
        isCurrent: false,
        hash: 'abc1234',
    };
}

describe('refModel', () => {
    it('classifies branch refs from branch metadata instead of slash characters', () => {
        const refs = parseRefs(['feature/search', 'origin/main', 'tag: v1.0.0'], [
            branch('feature/search', false),
            branch('origin/main', true),
        ]);

        expect(refs).toContainEqual(expect.objectContaining({ label: 'feature/search', kind: 'local' }));
        expect(refs).toContainEqual(expect.objectContaining({ label: 'origin/main', kind: 'remote' }));
        expect(refs).toContainEqual(expect.objectContaining({ label: 'v1.0.0', kind: 'tag' }));
    });
});
