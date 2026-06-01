import { describe, expect, it } from 'vitest';
import type { BranchInfo } from '../../../src/protocol/graph/types';
import { buildRemoteBranchTree } from '../../../src/webview/features/graph/graphBranchTree';
import { expectItem } from '../../helpers/assertions';

function branch(name: string, isRemote: boolean): BranchInfo {
    return {
        name,
        isRemote,
        isCurrent: false,
        hash: 'abc1234',
    };
}

describe('graphBranchTree', () => {
    it('keeps full remote branch names while displaying them under remote folders', () => {
        const tree = buildRemoteBranchTree([
            branch('origin/main', true),
            branch('origin/feature/search', true),
        ]);

        const origin = expectItem(tree, 0);
        expect(origin.name).toBe('origin');
        expect(origin.fullName).toBe('origin');

        const featureFolder = origin.children.find((node) => node.name === 'feature');
        expect(featureFolder).toBeDefined();
        expect(featureFolder?.fullName).toBe('origin/feature');

        const search = featureFolder?.children.find((node) => node.name === 'search');
        expect(search?.fullName).toBe('origin/feature/search');

        const main = origin.children.find((node) => node.name === 'main');
        expect(main?.fullName).toBe('origin/main');
    });
});
