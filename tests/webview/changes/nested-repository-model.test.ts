import { describe, expect, it } from 'vitest';
import type { RepositorySummary } from '@protocol/shared/repo';
import {
    nestedRepositoryContextId,
    nestedRepositoryContextIdsByPath,
} from '@webview/features/changes/nested-repository-model';

describe('nestedRepositoryModel', () => {
    it('matches an untracked directory path to a discovered child repository', () => {
        const contexts = nestedRepositoryContextIdsByPath([
            repository('parent', '/workspace/engage_sdks'),
            repository('android', '/workspace/engage_sdks/android/engage_android', 'parent'),
        ], 'parent');

        expect(nestedRepositoryContextId(contexts, 'android/engage_android/')).toBe('android');
        expect(nestedRepositoryContextId(contexts, 'Android/Engage_Android/')).toBeUndefined();
    });

    it('normalizes Windows paths without changing POSIX path semantics', () => {
        const contexts = nestedRepositoryContextIdsByPath([
            repository('parent', 'C:\\Workspace\\Engage_Sdks'),
            repository('flutter', 'c:\\workspace\\engage_sdks\\flutter\\engage_flutter', 'parent'),
        ], 'parent');

        expect(nestedRepositoryContextId(contexts, 'Flutter/Engage_Flutter/')).toBe('flutter');
    });

    it('matches UNC repository paths case-insensitively', () => {
        const contexts = nestedRepositoryContextIdsByPath([
            repository('parent', '\\\\server\\share\\workspace'),
            repository('ios', '\\\\SERVER\\SHARE\\WORKSPACE\\ios', 'parent'),
        ], 'parent');

        expect(nestedRepositoryContextId(contexts, 'IOS/')).toBe('ios');
    });

    it('ignores worktrees, submodules, unrelated repositories, and descendants of another context', () => {
        const contexts = nestedRepositoryContextIdsByPath([
            repository('parent', '/workspace/root'),
            repository('worktree', '/workspace/root-worktree', 'parent', 'worktree'),
            repository('submodule', '/workspace/root/modules/auth', 'parent', 'submodule'),
            repository('other', '/workspace/other'),
            repository('grandchild', '/workspace/root/packages/app', 'child'),
        ], 'parent');

        expect([...contexts.entries()]).toEqual([]);
    });
});

function repository(
    id: string,
    cwd: string,
    parentId?: string,
    kind: 'main' | 'worktree' | 'submodule' = 'main',
): RepositorySummary {
    return {
        context: { id, cwd, kind, ...(parentId ? { parentId } : {}), label: id },
        hasRemote: false,
        branchCount: 0,
        submoduleCount: 0,
        worktreeCount: 0,
        stagedCount: 0,
        unstagedCount: 0,
        conflictCount: 0,
    };
}
