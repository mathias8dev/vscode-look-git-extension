import type { BranchInfo } from '@protocol/graph/types';

export type BranchComparisonSelection = readonly [] | readonly [string] | readonly [string, string];

type SelectionAction =
    | { readonly type: 'toggle'; readonly ref: string; readonly anchor?: string }
    | { readonly type: 'clear' };

export function reduceBranchComparisonSelection(state: BranchComparisonSelection, action: SelectionAction): BranchComparisonSelection {
    if (action.type === 'clear') { return []; }
    if (state[0] === action.ref) { return state[1] ? [state[1]] : []; }
    if (state[1] === action.ref && state[0]) { return [state[0]]; }
    if (state[0]) { return [state[0], action.ref]; }
    return action.anchor && action.anchor !== action.ref ? [action.anchor, action.ref] : [action.ref];
}

export function comparisonBranchRef(branch: Pick<BranchInfo, 'name' | 'isRemote'>): string {
    return `${branch.isRemote ? 'refs/remotes/' : 'refs/heads/'}${branch.name}`;
}
