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
        const runtime = recordingRuntime(calls, ['addWorktree']);
        const signal = new AbortController().signal;
        const repository = new RuntimeGitRepository({
            repoId: 'repo',
            cwd: '/repo',
            gitDir: '/repo/.git',
            kind: 'main',
            label: 'repo',
        }, runtime);

        await repository.addWorktree({ path: '/repo-feature', branch: 'feature/new', createNew: true }, signal);

        expect(calls[0]).toMatchObject({
            operation: 'addWorktree',
            input: { path: '/repo-feature', branch: 'feature/new', createNew: true },
            signal,
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
