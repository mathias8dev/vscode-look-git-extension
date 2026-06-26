import { describe, expect, it } from 'vitest';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { HybridGitRuntime } from '@extension/git/hybrid-git-runtime';

const context = {
    cwd: '/repo',
    gitDir: '/repo/.git',
    repositoryId: 'repo',
    kind: 'main',
} satisfies GitExecutionContext;

describe('HybridGitRuntime', () => {
    it('selects the first runtime that supports an operation', async () => {
        const runtime = new HybridGitRuntime([
            fakeRuntime(false, 'first'),
            fakeRuntime(true, 'second'),
        ]);

        await expect(runtime.execute('push', context, {})).resolves.toBe('second:push');
    });

    it('forwards context, input, and abort signal only to the selected runtime', async () => {
        const calls: RuntimeCall[] = [];
        const input = { remote: 'upstream', branch: 'main' };
        const signal = new AbortController().signal;
        const runtime = new HybridGitRuntime([
            recordingRuntime({ label: 'cli', supported: false, calls }),
            recordingRuntime({ label: 'vscode', supported: true, calls }),
            recordingRuntime({ label: 'native', supported: true, calls }),
        ]);

        await expect(runtime.execute('forcePushWithLease', context, input, signal)).resolves.toBe('vscode:forcePushWithLease');

        expect(calls).toEqual([
            { label: 'cli', phase: 'supports', operation: 'forcePushWithLease', context, input: undefined, signal: undefined },
            { label: 'vscode', phase: 'supports', operation: 'forcePushWithLease', context, input: undefined, signal: undefined },
            { label: 'vscode', phase: 'execute', operation: 'forcePushWithLease', context, input, signal },
        ]);
    });

    it('throws when no runtime supports an operation', async () => {
        const runtime = new HybridGitRuntime([fakeRuntime(false, 'first')]);

        await expect(runtime.execute('push', context, {})).rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });

    it('falls back to the next runtime when a supported runtime cannot execute the operation for this context', async () => {
        const runtime = new HybridGitRuntime([
            unsupportedRuntime(),
            fakeRuntime(true, 'cli'),
        ]);

        await expect(runtime.execute('push', context, {})).resolves.toBe('cli:push');
    });
});

function fakeRuntime(supported: boolean, label: string): GitRuntime {
    return {
        supports(): boolean {
            return supported;
        },
        async execute<_TInput = unknown, TResult = unknown>(_operation: SemanticGitOperation): Promise<TResult> {
            return `${label}:${_operation}` as TResult; // Test runtime only returns the string result asserted by this spec.
        },
    };
}

function unsupportedRuntime(): GitRuntime {
    return {
        supports(): boolean {
            return true;
        },
        async execute(operation: SemanticGitOperation, runtimeContext: GitExecutionContext): Promise<never> {
            throw new UnsupportedGitOperationError(operation, runtimeContext);
        },
    };
}

interface RuntimeCall {
    readonly label: string;
    readonly phase: 'supports' | 'execute';
    readonly operation: SemanticGitOperation;
    readonly context: GitExecutionContext;
    readonly input: unknown;
    readonly signal: AbortSignal | undefined;
}

function recordingRuntime(input: {
    readonly label: string;
    readonly supported: boolean;
    readonly calls: RuntimeCall[];
}): GitRuntime {
    return {
        supports(operation, runtimeContext): boolean {
            input.calls.push({
                label: input.label,
                phase: 'supports',
                operation,
                context: runtimeContext,
                input: undefined,
                signal: undefined,
            });
            return input.supported;
        },
        async execute<TInput = unknown, TResult = unknown>(
            operation: SemanticGitOperation,
            runtimeContext: GitExecutionContext,
            runtimeInput: TInput,
            signal?: AbortSignal,
        ): Promise<TResult> {
            input.calls.push({
                label: input.label,
                phase: 'execute',
                operation,
                context: runtimeContext,
                input: runtimeInput,
                signal,
            });
            return `${input.label}:${operation}` as TResult;
        },
    };
}
