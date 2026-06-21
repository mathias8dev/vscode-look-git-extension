import { describe, expect, it } from 'vitest';
import { RepoKind } from '@core/git/domain/repo-context';
import type { GitExecutionContext, GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import type { GraphExtensionToWebviewMessage } from '@protocol/graph/messages';
import type { RepositoryLocator } from '@protocol/shared/repo';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { GraphMessageRouter } from '@extension/messaging/graph-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';

describe('GraphMessageRouter', () => {
    it('resolves commit detail requests through repository locators', async () => {
        const calls: GitExecutionContext[] = [];
        const runtime: GitRuntime = {
            supports: () => true,
            async execute<TInput = unknown, TResult = unknown>(operation: SemanticGitOperation, context: GitExecutionContext, input: TInput): Promise<TResult> {
                calls.push(context);
                if (operation === 'getCommitFiles') { return [] as TResult; } // Router test exercises this operation as a file-list result.
                if (operation === 'getCommitMessage') {
                    return `${context.repositoryId}:${commitFromInput(input)}` as TResult; // Router test exercises this operation as a message string.
                }
                throw new Error(`Unexpected operation ${operation}`);
            },
        };
        const registry = new RepositoryRegistry();
        const submoduleRepository = new RuntimeGitRepository({
            repoId: 'submodule-id',
            cwd: '/repo/modules/auth-kit',
            gitDir: '/repo/modules/auth-kit/.git',
            kind: 'submodule',
            label: 'auth-kit',
            parentRepositoryId: 'repo-id',
        }, runtime);
        registry.registerRepository(submoduleRepository);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const repository = {
            repoId: 'submodule-id',
            kind: 'submodule',
            path: '/repo/modules/auth-kit',
            parentRepoId: 'repo-id',
        } satisfies RepositoryLocator;
        const router = new GraphMessageRouter(
            { currentContext: { id: 'repo-id', cwd: '/repo', kind: RepoKind.Main, label: 'repo' } },
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            registry,
        );

        await router.handle({
            type: 'graph/commitDetailsRequest',
            requestId: 'details-1',
            hash: 'abc123',
            repository,
        });

        expect(messages).toContainEqual({
            type: 'graph/commitDetailsResponse',
            requestId: 'details-1',
            hash: 'abc123',
            fullMessage: 'submodule-id:abc123',
            files: [],
        });
        expect(calls.map((call) => call.repositoryId)).toEqual(['submodule-id', 'submodule-id']);
    });
});

function commitFromInput(input: unknown): string {
    if (typeof input === 'object' && input !== null && 'commit' in input && typeof input.commit === 'string') {
        return input.commit;
    }
    throw new Error('Expected commit input.');
}
