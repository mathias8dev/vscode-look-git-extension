import { describe, expect, it } from 'vitest';
import type { GitGraphCommit } from '../../../src/core/git/domain/GitCommit';
import type { GitBranch } from '../../../src/core/git/domain/GitStatus';
import { RepoKind } from '../../../src/core/git/domain/RepoContext';
import {
    toProtocolBranch,
    toProtocolGraphCommit,
    toSerializedRepoContext,
    toProtocolSubmoduleStatus,
} from '../../../src/extension/mapping/toProtocol';

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
