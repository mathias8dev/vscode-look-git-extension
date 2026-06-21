import { describe, expect, it } from 'vitest';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '@application/ports/git-runtime';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';

describe('RuntimeWorktree', () => {
    it('delegates worktree semantic actions through GitRuntime', async () => {
        const calls: RuntimeCall[] = [];
        const worktree = new RuntimeWorktree({
            repoId: 'repo',
            worktreeId: 'worktree',
            path: '/repo-linked',
            gitDir: '/repo/.git/worktrees/repo-linked',
            repositoryKind: 'main',
            isMain: false,
            head: 'abc123',
            branch: 'feature/new',
            dirty: true,
        }, recordingRuntime(calls, ['stage']));

        await worktree.stage(['src/a.ts']);

        expect(calls).toEqual([{
            operation: 'stage',
            context: {
                cwd: '/repo-linked',
                gitDir: '/repo/.git/worktrees/repo-linked',
                repositoryId: 'repo',
                worktreeId: 'worktree',
                kind: 'main',
                parentRepositoryId: undefined,
            },
            input: { paths: ['src/a.ts'] },
            signal: undefined,
        }]);
    });

    it('uses operation-specific runtime input shapes for direct CLI-compatible actions', async () => {
        const calls: RuntimeCall[] = [];
        const worktree = new RuntimeWorktree({
            repoId: 'repo',
            worktreeId: 'main',
            path: '/repo',
            gitDir: '/repo/.git',
            repositoryKind: 'main',
            isMain: true,
            head: 'abc123',
            dirty: false,
        }, recordingRuntime(calls, ['resetHard', 'dropStash', 'pushTags', 'acceptOurs', 'acceptTheirs', 'getFileAtRevision', 'getFileFromIndex', 'getConflictStages', 'getStashFiles', 'getStashSummary']));

        await worktree.resetHard('HEAD~1');
        await worktree.dropStash('stash@{0}');
        await worktree.pushTags('origin', {});
        await worktree.acceptOurs(['src/conflict.ts']);
        await worktree.acceptTheirs(['src/other.ts']);
        await worktree.getFileAtRevision('src/head.ts', 'HEAD');
        await worktree.getFileFromIndex('src/indexed.ts');
        await worktree.getConflictStages('src/conflict.ts');
        await worktree.getStashFiles('stash@{2}');
        await worktree.getStashSummary('stash@{3}');

        expect(calls.map((call) => call.input)).toEqual([
            'HEAD~1',
            'stash@{0}',
            { remote: 'origin', options: {} },
            { paths: ['src/conflict.ts'] },
            { paths: ['src/other.ts'] },
            { path: 'src/head.ts', revision: 'HEAD' },
            { path: 'src/indexed.ts' },
            { path: 'src/conflict.ts' },
            { stash: 'stash@{2}' },
            { stash: 'stash@{3}' },
        ]);
    });

    it('preserves guarded rewrite, reset, clean, and remote action inputs', async () => {
        const calls: RuntimeCall[] = [];
        const signal = new AbortController().signal;
        const worktree = new RuntimeWorktree({
            repoId: 'repo',
            worktreeId: 'main',
            path: '/repo',
            gitDir: '/repo/.git',
            repositoryKind: 'main',
            isMain: true,
            head: 'abc123',
            dirty: true,
        }, recordingRuntime(calls, [
            'squashCommits',
            'fixupCommits',
            'dropCommit',
            'cherryPick',
            'revertCommit',
            'resetPaths',
            'restoreFromReflog',
            'cleanIgnored',
            'pushRef',
            'forcePushWithLease',
        ]));

        await worktree.squashCommits(['a1', 'b2'], 'feat: squashed');
        await worktree.fixupCommits(['c3']);
        await worktree.dropCommit('d4');
        await worktree.cherryPick('e5', { noCommit: true });
        await worktree.revertCommit('f6', { noCommit: true, noEdit: true });
        await worktree.resetPaths(['src/a.ts'], 'HEAD~1');
        await worktree.restoreFromReflog('HEAD@{1}', 'mixed');
        await worktree.cleanIgnored(['dist'], { directories: true, force: true });
        await worktree.pushRef('upstream', 'HEAD', 'refs/heads/main', { forceWithLease: true });
        await worktree.forcePushWithLease('upstream', 'main', signal);

        expect(calls.map((call) => call.input)).toEqual([
            { commits: ['a1', 'b2'], message: 'feat: squashed' },
            { commits: ['c3'] },
            { commit: 'd4' },
            { commit: 'e5', options: { noCommit: true } },
            { commit: 'f6', options: { noCommit: true, noEdit: true } },
            { paths: ['src/a.ts'], sourceRef: 'HEAD~1' },
            { entry: 'HEAD@{1}', mode: 'mixed' },
            { paths: ['dist'], options: { directories: true, force: true } },
            { remote: 'upstream', sourceRef: 'HEAD', destinationRef: 'refs/heads/main', options: { forceWithLease: true } },
            { remote: 'upstream', branch: 'main' },
        ]);
        expect(calls.at(-1)?.signal).toBe(signal);
    });

    it('forwards abort signals', async () => {
        const calls: RuntimeCall[] = [];
        const signal = new AbortController().signal;
        const worktree = new RuntimeWorktree({
            repoId: 'repo',
            worktreeId: 'main',
            path: '/repo',
            gitDir: '/repo/.git',
            repositoryKind: 'main',
            isMain: true,
            head: 'abc123',
            dirty: false,
        }, recordingRuntime(calls, ['push']));

        await worktree.push('origin', {}, signal);

        expect(calls[0]?.signal).toBe(signal);
    });

    it('fails explicitly when the runtime does not support an operation', async () => {
        const worktree = new RuntimeWorktree({
            repoId: 'repo',
            worktreeId: 'main',
            path: '/repo',
            gitDir: '/repo/.git',
            repositoryKind: 'main',
            isMain: true,
            head: 'abc123',
            dirty: false,
        }, recordingRuntime([], []));

        await expect(worktree.getStatus()).rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });
});

interface RuntimeCall {
    readonly operation: SemanticGitOperation;
    readonly context: GitExecutionContext;
    readonly input: unknown;
    readonly signal: AbortSignal | undefined;
}

function recordingRuntime(calls: RuntimeCall[], supportedOperations: readonly SemanticGitOperation[]): GitRuntime {
    return {
        supports(operation): boolean {
            return supportedOperations.includes(operation);
        },
        async execute<TInput, TResult>(
            operation: SemanticGitOperation,
            context: GitExecutionContext,
            input: TInput,
            signal?: AbortSignal,
        ): Promise<TResult> {
            calls.push({ operation, context, input, signal });
            return undefined as TResult;
        },
    };
}
