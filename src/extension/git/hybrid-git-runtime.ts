import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '../../application/ports/git-runtime';
import type { SemanticGitOperation } from '../../application/ports/git-operation';
import { CliGitRuntime } from './cli-git-runtime';

export class HybridGitRuntime implements GitRuntime {
    constructor(
        private readonly runtimes: readonly GitRuntime[] = [new CliGitRuntime()],
    ) {}

    supports(operation: SemanticGitOperation, context: GitExecutionContext): boolean {
        return this.runtimes.some((runtime) => runtime.supports(operation, context));
    }

    async execute<TInput = unknown, TResult = unknown>(
        operation: SemanticGitOperation,
        context: GitExecutionContext,
        input: TInput,
        signal?: AbortSignal,
    ): Promise<TResult> {
        const runtime = this.runtimes.find((candidate) => candidate.supports(operation, context));
        if (!runtime) {
            throw new UnsupportedGitOperationError(operation, context);
        }
        return runtime.execute<TInput, TResult>(operation, context, input, signal);
    }
}
