import { describe, expect, it, vi } from 'vitest';
import type { RewordCommitMessageGeneratorInput } from '../../../../src/application/ports/commit-message-generator';
import { GenerateRewordCommitMessageUseCase } from '../../../../src/application/usecases/commits/generate-reword-commit-message';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GenerateRewordCommitMessageUseCase', () => {
    it('builds bounded selected-commit context and normalizes model JSON', async () => {
        const execRaw = vi.fn(async (args: readonly string[]) => {
            if (args.includes('--name-status')) { return 'M\0src/graph.ts\0'; }
            if (args.includes('--unified=3')) { return 'diff --git a/src/graph.ts b/src/graph.ts\n+refresh graph\n'; }
            return '';
        });
        const exec = vi.fn(async (args: readonly string[]) => {
            if (args.includes('--stat')) { return ' src/graph.ts | 1 +\n'; }
            if (args.includes('--pretty=format:%s')) { return 'fix(graph): previous\nfeat(changes): old\n'; }
            return '';
        });
        const generateRewordCommitMessage = vi.fn(async (_input: RewordCommitMessageGeneratorInput) => {
            return '{"message":"fix(graph): refresh after branch deletion"}';
        });
        const repo = makeRepositoryMock({ execRaw, exec });

        const result = await new GenerateRewordCommitMessageUseCase({ generateRewordCommitMessage })
            .execute(repo, 'abc1234', 'old subject');
        const firstCall = generateRewordCommitMessage.mock.calls[0];
        if (!firstCall) { throw new Error('Expected commit message generator call.'); }
        const [input] = firstCall;

        expect(result.message).toBe('fix(graph): refresh after branch deletion');
        expect(input.currentMessage).toBe('old subject');
        expect(input.changedFiles).toEqual(['M src/graph.ts']);
        expect(input.diffStat).toContain('src/graph.ts');
        expect(input.commitDiff).toContain('diff --git');
        expect(input.commitDiffTruncated).toBe(false);
        expect(input.recentCommitSubjects).toEqual(['fix(graph): previous', 'feat(changes): old']);
        expect(execRaw).toHaveBeenCalledWith(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--root', 'abc1234'], undefined);
    });

    it('rejects generation when the selected commit has no changes', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
            exec: vi.fn(async () => ''),
        });

        await expect(new GenerateRewordCommitMessageUseCase({
            generateRewordCommitMessage: vi.fn(async () => 'fix: unused'),
        }).execute(repo, 'abc1234', 'old subject')).rejects.toThrow('No commit changes were found to generate a message.');
    });
});
