import { describe, expect, it } from 'vitest';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '@application/ports/git-runtime';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';

describe('RuntimeGitRepository', () => {
    it('delegates repository semantic actions through GitRuntime', async () => {
        const calls: RuntimeCall[] = [];
        const runtime = recordingRuntime(calls, ['listRemotes']);
        const repository = new RuntimeGitRepository({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
        }, runtime);

        await expect(repository.listRemotes()).resolves.toEqual(['origin']);

        expect(calls).toEqual([{
            operation: 'listRemotes',
            context: {
                cwd: '/repo',
                gitDir: '/repo/.git',
                repositoryId: 'repo',
                kind: 'main',
                parentRepositoryId: undefined,
            },
            input: undefined,
            signal: undefined,
        }]);
    });

    it('forwards input and signal for topology actions', async () => {
        const calls: RuntimeCall[] = [];
        const runtime = recordingRuntime(calls, ['addWorktree', 'addDetachedWorktree', 'removeWorktree', 'deleteRemoteBranch', 'setRemoteUrl']);
        const signal = new AbortController().signal;
        const repository = new RuntimeGitRepository({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
        }, runtime);

        await repository.addWorktree({ path: '/repo-feature', branch: 'feature/new', createNew: true }, signal);
        await repository.addDetachedWorktree('/repo-detached', 'abc123');
        await repository.removeWorktree('/repo-feature', true);
        await repository.deleteRemoteBranch('upstream', 'feature/old');
        await repository.setRemoteUrl('upstream', 'git@example.com:team/repo.git');

        expect(calls.map((call) => call.input)).toEqual([
            { path: '/repo-feature', branch: 'feature/new', createNew: true },
            { path: '/repo-detached', ref: 'abc123' },
            { worktree: '/repo-feature', force: true },
            { remote: 'upstream', branch: 'feature/old' },
            { remote: 'upstream', url: 'git@example.com:team/repo.git' },
        ]);
        expect(calls[0]?.signal).toBe(signal);
    });

    it('preserves submodule repository context for semantic actions', async () => {
        const calls: RuntimeCall[] = [];
        const repository = new RuntimeGitRepository({
            repoId: 'submodule',
            cwd: '/repo/libs/auth',
            gitDir: '/repo/.git/modules/libs/auth',
            kind: 'submodule',
            label: 'auth',
            parentRepositoryId: 'repo',
        }, recordingRuntime(calls, ['listBranches']));

        await repository.listBranches();

        expect(calls[0]?.context).toEqual({
            cwd: '/repo/libs/auth',
            gitDir: '/repo/.git/modules/libs/auth',
            repositoryId: 'submodule',
            kind: 'submodule',
            parentRepositoryId: 'repo',
        });
    });

    it('fails explicitly when the runtime does not support an operation', async () => {
        const repository = new RuntimeGitRepository({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
        }, recordingRuntime([], []));

        await expect(repository.listBranches()).rejects.toBeInstanceOf(UnsupportedGitOperationError);
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
            const output = operation === 'listRemotes' ? ['origin'] : undefined;
            return output as TResult;
        },
    };
}
