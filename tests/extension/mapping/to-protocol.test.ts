import { describe, expect, it } from 'vitest';
import type { GitGraphCommit } from '@core/git/domain/git-commit';
import type { GitBranch } from '@core/git/domain/git-status';
import { RepoKind } from '@core/git/domain/repo-context';
import {
    toProtocolBranch,
    toProtocolGraphCommit,
    toProtocolGraphSubmodule,
    toSerializedRepoContext,
    toProtocolSubmoduleStatus,
    toProtocolWorktree,
} from '@extension/mapping/to-protocol';

describe('toProtocol mapping', () => {
    it('maps graph commits as semantic protocol data without rendering fields', () => {
        const commit: GitGraphCommit = {
            hash: 'abc123456789',
            shortHash: 'abc1234',
            message: 'feat: graph',
            authorName: 'Ada',
            authorEmail: 'ada@example.com',
            authorDate: '2024-01-01T00:00:00Z',
            parentHashes: ['parent'],
            refs: ['HEAD -> main'],
            matchesFilter: true,
        };

        const mapped = toProtocolGraphCommit(commit);

        expect(mapped).toEqual(commit);
        expect(mapped).not.toHaveProperty('laneData');
        expect(mapped).not.toHaveProperty('color');
    });

    it('maps zero branch tracking counts to absent protocol values', () => {
        const branch: GitBranch = {
            name: 'main',
            isRemote: false,
            isCurrent: true,
            hash: 'abc1234',
            ahead: 0,
            behind: 0,
        };

        expect(toProtocolBranch(branch)).toEqual({
            name: 'main',
            isRemote: false,
            isCurrent: true,
            hash: 'abc1234',
            upstream: undefined,
            ahead: undefined,
            behind: undefined,
        });
    });

    it('maps submodule status into protocol vocabulary', () => {
        expect(toProtocolSubmoduleStatus(' ')).toBe('clean');
        expect(toProtocolSubmoduleStatus('+')).toBe('out-of-sync');
        expect(toProtocolSubmoduleStatus('-')).toBe('not-initialized');
        expect(toProtocolSubmoduleStatus('U')).toBe('dirty');
    });

    it('maps graph worktree locators when repository id is available', () => {
        expect(toProtocolWorktree({
            path: '/workspace/repo',
            head: 'abc1234',
            branch: 'main',
            isMain: true,
            isDetached: false,
            isLocked: false,
        }, 'repo-id')).toEqual(expect.objectContaining({
            locator: {
                repoId: 'repo-id',
                worktreeId: expect.any(String),
                path: '/workspace/repo',
            },
        }));
    });

    it('maps graph submodule repository locators', () => {
        const repository = {
            repoId: 'submodule-id',
            kind: 'submodule',
            path: '/workspace/repo/modules/auth-kit',
            parentRepoId: 'repo-id',
        } as const;

        expect(toProtocolGraphSubmodule({
            path: 'modules/auth-kit',
            status: ' ',
            branches: [],
            worktrees: [],
        }, repository)).toEqual(expect.objectContaining({
            repository,
            path: 'modules/auth-kit',
        }));
    });

    it('maps domain repo context into serialized protocol context', () => {
        expect(toSerializedRepoContext({
            id: 'repo-id',
            cwd: '/workspace/repo',
            kind: RepoKind.Worktree,
            parentId: 'parent-id',
            label: 'repo',
        })).toEqual({
            id: 'repo-id',
            cwd: '/workspace/repo',
            kind: 'worktree',
            parentId: 'parent-id',
            label: 'repo',
        });
    });
});
