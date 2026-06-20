import { describe, expect, it } from 'vitest';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime } from '../../../src/application/ports/git-runtime';
import type { SemanticGitOperation } from '../../../src/application/ports/git-operation';
import { HybridGitRuntime } from '../../../src/extension/git/hybrid-git-runtime';

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

    it('throws when no runtime supports an operation', async () => {
        const runtime = new HybridGitRuntime([fakeRuntime(false, 'first')]);

        await expect(runtime.execute('push', context, {})).rejects.toBeInstanceOf(UnsupportedGitOperationError);
    });
});

function fakeRuntime(supported: boolean, label: string): GitRuntime {
    return {
        supports(): boolean {
            return supported;
        },
        async execute(_operation: SemanticGitOperation): Promise<string> {
            return `${label}:${_operation}`;
        },
    };
}
