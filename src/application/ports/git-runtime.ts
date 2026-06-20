import type { SemanticGitOperation } from './git-operation';

export type RepositoryKind = 'main' | 'submodule';

export interface GitExecutionContext {
    readonly cwd: string;
    readonly gitDir: string;
    readonly repositoryId: string;
    readonly worktreeId?: string;
    readonly kind: RepositoryKind;
    readonly parentRepositoryId?: string;
}

export interface GitRuntime {
    supports(operation: SemanticGitOperation, context: GitExecutionContext): boolean;
    execute<TInput = unknown, TResult = unknown>(
        operation: SemanticGitOperation,
        context: GitExecutionContext,
        input: TInput,
        signal?: AbortSignal,
    ): Promise<TResult>;
}

export class UnsupportedGitOperationError extends Error {
    readonly operation: SemanticGitOperation;
    readonly context: GitExecutionContext;

    constructor(operation: SemanticGitOperation, context: GitExecutionContext) {
        super(`Unsupported git operation "${operation}" for ${context.kind} repository at ${context.cwd}`);
        this.name = 'UnsupportedGitOperationError';
        this.operation = operation;
        this.context = context;
    }
}
