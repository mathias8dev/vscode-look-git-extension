import { describe, expect, it } from 'vitest';
import { selectBranchFilter } from '@webview/features/graph/graph-branch-selection';

describe('graphBranchSelection', () => {
    it('keeps branch selection idempotent instead of toggling it off', () => {
        expect(selectBranchFilter('main', 'main')).toBe('main');
        expect(selectBranchFilter('feature/ui', 'main')).toBe('feature/ui');
    });
});
