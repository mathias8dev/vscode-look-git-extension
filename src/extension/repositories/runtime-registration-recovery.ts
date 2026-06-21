import type { RepoContext } from '@core/git/domain/repo-context';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';

export interface RuntimeRegistrationSelection {
    readonly currentContext: RepoContext | undefined;
}

export interface RuntimeRegistrationRegistrar {
    registerContext(runtimeRepositories: RepositoryRegistry, repoContext: RepoContext): Promise<void>;
}

export async function registerRuntimeContextWithRecovery(input: {
    readonly repositories: RuntimeRegistrationSelection;
    readonly runtimeRegistrar: RuntimeRegistrationRegistrar;
    readonly runtimeRepositories: RepositoryRegistry;
    readonly repoContext: RepoContext;
    readonly syncActiveRepository: () => void;
}): Promise<void> {
    try {
        await input.runtimeRegistrar.registerContext(input.runtimeRepositories, input.repoContext);
    } catch (error) {
        if (!isRecoverableRuntimeRegistrationError(error)) { throw error; }
        input.runtimeRepositories.clear();
        input.syncActiveRepository();
        if (input.repositories.currentContext?.id !== input.repoContext.id) { return; }
        await input.runtimeRegistrar.registerContext(input.runtimeRepositories, input.repoContext);
    }
}

export function isRecoverableRuntimeRegistrationError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('spawn git ENOENT')
        || message.includes('gitdir file points to non-existent location')
        || message.includes('prunable')
        || message.includes('ENOENT: no such file or directory');
}
