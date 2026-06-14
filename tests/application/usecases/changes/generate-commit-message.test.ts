import { describe, expect, it, vi } from 'vitest';
import type { CommitMessageGeneratorInput } from '../../../../src/application/ports/commit-message-generator';
import { GenerateCommitMessageUseCase } from '../../../../src/application/usecases/changes/generate-commit-message';
import { normalizeGeneratedCommitMessage } from '../../../../src/application/usecases/commit-message-normalization';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GenerateCommitMessageUseCase', () => {
    it('builds bounded staged-change context and normalizes model JSON', async () => {
        const execRaw = vi.fn(async (args: readonly string[]) => {
            if (args.includes('--name-status')) { return 'M\0src/app.ts\0'; }
            if (args.includes('--find-renames')) { return 'diff --git a/src/app.ts b/src/app.ts\n+new line\n'; }
            return '';
        });
        const exec = vi.fn(async (args: readonly string[]) => {
            if (args.includes('--stat')) { return ' src/app.ts | 1 +\n'; }
            if (args.includes('--pretty=format:%s')) { return 'fix(changes): previous\nfeat(graph): old\n'; }
            return '';
        });
        const generateCommitMessage = vi.fn(async (_input: CommitMessageGeneratorInput) => {
            return '{"message":"fix(changes): generate commit message"}';
        });
        const repo = makeRepositoryMock({ execRaw, exec });

        const result = await new GenerateCommitMessageUseCase({ generateCommitMessage }).execute(repo);
        const firstCall = generateCommitMessage.mock.calls[0];
        if (!firstCall) { throw new Error('Expected commit message generator call.'); }
        const [input] = firstCall;

        expect(result.message).toBe('fix(changes): generate commit message');
        expect(input.changedFiles).toEqual(['M src/app.ts']);
        expect(input.diffStat).toContain('src/app.ts');
        expect(input.stagedDiff).toContain('+new line');
        expect(input.stagedDiffTruncated).toBe(false);
        expect(input.recentCommitSubjects).toEqual(['fix(changes): previous', 'feat(graph): old']);
    });

    it('rejects generation when nothing is staged', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
            exec: vi.fn(async () => ''),
        });

        await expect(new GenerateCommitMessageUseCase({
            generateCommitMessage: vi.fn(async () => 'fix: unused'),
        }).execute(repo)).rejects.toThrow('Stage changes before generating a commit message.');
    });

    it('generates without recent commit subjects when git log is unavailable', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--name-status')) { return 'A\0README.md\0'; }
                if (args.includes('--find-renames')) { return 'diff --git a/README.md b/README.md\n+hello\n'; }
                return '';
            }),
            exec: vi.fn(async (args: readonly string[]) => {
                if (args.includes('--stat')) { return ' README.md | 1 +\n'; }
                throw new Error('fatal: your current branch does not have any commits yet');
            }),
        });
        const generateCommitMessage = vi.fn(async (input: CommitMessageGeneratorInput) => {
            expect(input.recentCommitSubjects).toEqual([]);
            return 'docs(readme): add project readme';
        });

        const result = await new GenerateCommitMessageUseCase({ generateCommitMessage }).execute(repo);

        expect(result.message).toBe('docs(readme): add project readme');
    });

    it('normalizes fenced JSON, subject/body JSON, and model prefaces', () => {
        expect(normalizeGeneratedCommitMessage('```json\n{"message":"feat(graph): add lanes"}\n```')).toBe('feat(graph): add lanes');
        expect(normalizeGeneratedCommitMessage('{"subject":"fix(changes): keep selection","body":"Preserve selected file after refresh."}'))
            .toBe('fix(changes): keep selection\n\nPreserve selected file after refresh.');
        expect(normalizeGeneratedCommitMessage('"chore(build): update package metadata"'))
            .toBe('chore(build): update package metadata');
        expect(normalizeGeneratedCommitMessage('Here is the commit message:\nfix(history): show full dates'))
            .toBe('fix(history): show full dates');
    });
});
