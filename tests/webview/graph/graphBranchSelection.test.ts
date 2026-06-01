import { describe, expect, it } from 'vitest';
import { selectBranchFilter } from '../../../src/webview/features/graph/graphBranchSelection';

describe('graphBranchSelection', () => {
    it('keeps branch selection idempotent instead of toggling it off', () => {
        expect(selectBranchFilter('main', 'main')).toBe('main');
        expect(selectBranchFilter('feature/ui', 'main')).toBe('feature/ui');
    });
});
