import { describe, expect, it } from 'vitest';
import { UnsupportedGitOperationError } from '../../../src/application/ports/git-runtime';
import type { GitExecutionContext } from '../../../src/application/ports/git-runtime';

describe('UnsupportedGitOperationError', () => {
    it('carries operation and execution context', () => {
        const context = {
            cwd: '/repo',
            gitDir: '/repo/.git',
            repositoryId: 'repo',
            worktreeId: 'main',
            kind: 'main',
        } satisfies GitExecutionContext;

        const error = new UnsupportedGitOperationError('push', context);

        expect(error.name).toBe('UnsupportedGitOperationError');
        expect(error.operation).toBe('push');
        expect(error.context).toBe(context);
        expect(error.message).toContain('/repo');
    });
});
