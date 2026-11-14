import type { GraphCommit, TagInfo, WorktreeInfo } from '@protocol/graph/types';
import { sameResourcePath } from '@webview/shared/resource-path';

export function detachedHeadModel(input: {
    readonly currentBranch: string;
    readonly repositoryPath: string | undefined;
    readonly commits: readonly GraphCommit[];
    readonly tags: readonly TagInfo[];
    readonly worktrees: readonly WorktreeInfo[];
}): { readonly hash: string; readonly label: string; readonly tags: readonly string[] } | undefined {
    if (input.currentBranch !== 'HEAD') { return undefined; }
    const worktree = input.repositoryPath
        ? input.worktrees.find(item => sameResourcePath(item.path, input.repositoryPath))
        : input.worktrees.find(item => item.isMain);
    const headCommit = input.commits.find(commit => commit.refs.includes('HEAD'));
    const hash = worktree?.head ?? headCommit?.hash;
    if (!hash || hash === 'HEAD' || /^0+$/.test(hash)) { return undefined; }
    const tags = input.tags.filter(tag => tag.hash === hash).map(tag => tag.name);
    return { hash, label: tags.length > 0 ? tags.join(', ') : hash.substring(0, 7), tags };
}
