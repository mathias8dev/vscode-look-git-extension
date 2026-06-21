import { describe, expect, it } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import {
    isRecoverableRuntimeRegistrationError,
    registerRuntimeContextWithRecovery,
    type RuntimeRegistrationRegistrar,
    type RuntimeRegistrationSelection,
} from '@extension/repositories/runtime-registration-recovery';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';

describe('runtime registration recovery', () => {
    it('retries once for recoverable runtime registration errors', async () => {
        const repoContext = context('repo');
        const runtimeRegistrar = runtimeRegistrarWith([
            new Error('spawn git ENOENT'),
            undefined,
        ]);
        const runtimeRepositories = new RepositoryRegistry();
        let syncCount = 0;

        await registerRuntimeContextWithRecovery({
            repositories: selection(repoContext),
            runtimeRegistrar,
            runtimeRepositories,
            repoContext,
            syncActiveRepository: () => { syncCount += 1; },
        });

        expect(runtimeRegistrar.calls).toBe(2);
        expect(syncCount).toBe(1);
    });

    it('does not retry unrelated registration errors', async () => {
        const repoContext = context('repo');
        const runtimeRegistrar = runtimeRegistrarWith([
            new Error('permission denied'),
        ]);

        await expect(registerRuntimeContextWithRecovery({
            repositories: selection(repoContext),
            runtimeRegistrar,
            runtimeRepositories: new RepositoryRegistry(),
            repoContext,
            syncActiveRepository: () => {},
        })).rejects.toThrow('permission denied');
        expect(runtimeRegistrar.calls).toBe(1);
    });

    it('recognizes stale runtime registration errors', () => {
        expect(isRecoverableRuntimeRegistrationError(new Error('spawn git ENOENT'))).toBe(true);
        expect(isRecoverableRuntimeRegistrationError(new Error('gitdir file points to non-existent location'))).toBe(true);
        expect(isRecoverableRuntimeRegistrationError(new Error('Repository "abc" is not registered.'))).toBe(false);
    });
});

function selection(currentContext: RepoContext): RuntimeRegistrationSelection {
    return { currentContext };
}

function runtimeRegistrarWith(
    results: readonly (Error | undefined)[],
): RuntimeRegistrationRegistrar & { readonly calls: number } {
    let calls = 0;
    return {
        get calls(): number {
            return calls;
        },
        async registerContext(): Promise<void> {
            const result = results[calls];
            calls += 1;
            if (result) { throw result; }
        },
    };
}

function context(id: string): RepoContext {
    return {
        id,
        cwd: `/${id}`,
        kind: RepoKind.Main,
        label: id,
    };
}
