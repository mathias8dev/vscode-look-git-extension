import * as path from 'path';
import { describe, expect, it } from 'vitest';
import type { GitStatus } from '@core/git/domain/git-status';
import { RepoKind } from '@core/git/domain/repo-context';
import { createRepoContext, createSubmoduleRepoContext } from '@extension/repositories/repo-context-factory';
import {
    excludeNestedRepositoryChanges,
    nestedRepositoryPaths,
} from '@extension/repositories/nested-repository-boundaries';

describe('nestedRepositoryBoundaries', () => {
    it('hides untracked entries matching registered child repositories', () => {
        const parent = createRepoContext(path.join(path.sep, 'workspace', 'engage_sdks'));
        const android = createRepoContext(path.join(parent.cwd, 'android', 'engage_android'), parent.id);
        const ios = createRepoContext(path.join(parent.cwd, 'ios'), parent.id);
        const status = gitStatus({
            unstaged: [
                { indexStatus: '?', workTreeStatus: '?', filePath: 'android/engage_android/' },
                { indexStatus: '?', workTreeStatus: '?', filePath: 'ios/' },
                { indexStatus: '?', workTreeStatus: '?', filePath: 'notes/' },
            ],
        });

        const visible = excludeNestedRepositoryChanges(status, nestedRepositoryPaths(parent, [parent, android, ios]));

        expect(visible.unstaged.map((entry) => entry.filePath)).toEqual(['notes/']);
    });

    it('keeps staged gitlinks, registered submodules, and unrelated nested paths visible', () => {
        const parent = createRepoContext(path.join(path.sep, 'workspace', 'root'));
        const child = createRepoContext(path.join(parent.cwd, 'packages', 'app'), parent.id);
        const submodule = createSubmoduleRepoContext(path.join(parent.cwd, 'modules', 'auth'), parent.id);
        const status = gitStatus({
            staged: [{ indexStatus: 'A', workTreeStatus: ' ', filePath: 'packages/app' }],
            unstaged: [
                { indexStatus: ' ', workTreeStatus: 'M', filePath: 'modules/auth', isSubmodule: true },
                { indexStatus: '?', workTreeStatus: '?', filePath: 'packages/app-example/' },
            ],
        });

        const repositoryPaths = nestedRepositoryPaths(parent, [parent, child, submodule, {
            id: 'worktree',
            cwd: path.join(parent.cwd, 'worktree'),
            kind: RepoKind.Worktree,
            parentId: parent.id,
            label: 'worktree',
        }]);
        const visible = excludeNestedRepositoryChanges(status, repositoryPaths);

        expect([...repositoryPaths]).toEqual(['packages/app']);
        expect(visible).toEqual(status);
    });
});

function gitStatus(overrides: Partial<GitStatus>): GitStatus {
    return {
        staged: [],
        unstaged: [],
        conflicts: [],
        conflictState: 'none',
        ...overrides,
    };
}
