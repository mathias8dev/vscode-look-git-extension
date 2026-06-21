import { describe, expect, it } from 'vitest';
import { messageForBranchCommand, messageForCommitCommand, messageForCommitDetails, messageForGraphContextTarget, messageForGraphDataRequest, messageForGraphRepositoryCommand, messageForOpenDiff } from '@webview/features/graph/graphCommands';

describe('graphCommands', () => {
    it('sends commit command selections', () => {
        expect(messageForCommitCommand('cherryPick', 'c', ['a', 'b', 'c'])).toEqual({
            type: 'graph/commitCommand',
            command: 'cherryPick',
            hash: 'c',
            hashes: ['a', 'b', 'c'],
        });
    });

    it('sends branch commands', () => {
        expect(messageForBranchCommand('mergeInto', 'feature/ui', false)).toEqual({
            type: 'graph/branchCommand',
            command: 'mergeInto',
            branch: 'feature/ui',
            isRemote: false,
        });
    });

    it('sends native context targets', () => {
        expect(messageForGraphContextTarget({ kind: 'worktree', path: '/repo/.worktrees/a' })).toEqual({
            type: 'graph/contextTarget',
            target: { kind: 'worktree', path: '/repo/.worktrees/a' },
        });
    });

    it('sends repository commands', () => {
        expect(messageForGraphRepositoryCommand('fetch')).toEqual({
            type: 'graph/repositoryCommand',
            command: 'fetch',
        });
    });

    it('does not invent a repository id before the host provides one', () => {
        expect(messageForGraphDataRequest(undefined, {}, { offset: 0, limit: 20 })).toEqual(expect.not.objectContaining({
            repoId: expect.any(String),
        }));
    });

    it('carries repository locators for graph and commit detail requests', () => {
        const repository = { repoId: 'submodule-id', kind: 'submodule', path: '/repo/modules/auth-kit', parentRepoId: 'repo-id' } as const;

        expect(messageForGraphDataRequest('repo', {}, { offset: 0, limit: 20 }, repository)).toEqual(expect.objectContaining({
            type: 'graph/dataRequest',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 20 },
            repository,
        }));
        expect(messageForCommitDetails('abc123', repository)).toEqual(expect.objectContaining({
            type: 'graph/commitDetailsRequest',
            hash: 'abc123',
            repository,
        }));
        expect(messageForOpenDiff('src/file.ts', 'abc123', 'M', undefined, undefined, undefined, repository)).toEqual({
            type: 'graph/openDiff',
            filePath: 'src/file.ts',
            commitHash: 'abc123',
            status: 'M',
            origPath: undefined,
            parentHash: undefined,
            isSubmodule: undefined,
            repository,
        });
    });
});
