import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommitMessageGeneratorInput, RewordCommitMessageGeneratorInput } from '../../../src/application/ports/commit-message-generator';
import { GenerateCommitMessageUseCase } from '../../../src/application/usecases/changes/generate-commit-message';
import { GenerateRewordCommitMessageUseCase } from '../../../src/application/usecases/commits/generate-reword-commit-message';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { createTempGitRepo, type TempGitRepo } from '../../helpers/gitRepo';

describe('GenerateCommitMessageUseCase with GitProcessRepository', () => {
    const repos: TempGitRepo[] = [];

    afterEach(() => {
        while (repos.length) { repos.pop()!.cleanup(); }
    });

    it('reads staged files, diff stat, staged diff and recent commit subjects from a real repo', async () => {
        const fixture = createTempGitRepo();
        repos.push(fixture);
        fixture.commitFile('src/app.ts', 'old\n', 'chore(changes): seed app');
        fixture.write('src/app.ts', 'old\nnew\n');
        fixture.git(['add', 'src/app.ts']);

        const generateCommitMessage = vi.fn(async (_input: CommitMessageGeneratorInput) => 'fix(changes): update app');
        const result = await new GenerateCommitMessageUseCase({ generateCommitMessage }).execute(new GitProcessRepository(fixture.cwd));
        const firstCall = generateCommitMessage.mock.calls[0];
        if (!firstCall) { throw new Error('Expected commit message generator call.'); }
        const [input] = firstCall;

        expect(result.message).toBe('fix(changes): update app');
        expect(input.changedFiles).toEqual(['M src/app.ts']);
        expect(input.diffStat).toContain('src/app.ts');
        expect(input.stagedDiff).toContain('+new');
        expect(input.recentCommitSubjects).toContain('chore(changes): seed app');
    });

    it('generates from staged files before the first commit exists', async () => {
        const fixture = createTempGitRepo();
        repos.push(fixture);
        fixture.write('README.md', 'hello\n');
        fixture.git(['add', 'README.md']);

        const generateCommitMessage = vi.fn(async (input: CommitMessageGeneratorInput) => {
            expect(input.changedFiles).toEqual(['A README.md']);
            expect(input.recentCommitSubjects).toEqual([]);
            return 'docs(readme): add project readme';
        });
        const result = await new GenerateCommitMessageUseCase({ generateCommitMessage }).execute(new GitProcessRepository(fixture.cwd));

        expect(result.message).toBe('docs(readme): add project readme');
    });

    it('reads selected commit files, diff stat, diff and recent subjects from a real repo', async () => {
        const fixture = createTempGitRepo();
        repos.push(fixture);
        fixture.commitFile('src/app.ts', 'old\n', 'chore(changes): seed app');
        const targetHash = fixture.commitFile('src/app.ts', 'old\nnew\n', 'fix(changes): old message');

        const generateRewordCommitMessage = vi.fn(async (_input: RewordCommitMessageGeneratorInput) => 'fix(changes): update app');
        const result = await new GenerateRewordCommitMessageUseCase({ generateRewordCommitMessage })
            .execute(new GitProcessRepository(fixture.cwd), targetHash, 'fix(changes): old message');
        const firstCall = generateRewordCommitMessage.mock.calls[0];
        if (!firstCall) { throw new Error('Expected commit message generator call.'); }
        const [input] = firstCall;

        expect(result.message).toBe('fix(changes): update app');
        expect(input.currentMessage).toBe('fix(changes): old message');
        expect(input.changedFiles).toEqual(['M src/app.ts']);
        expect(input.diffStat).toContain('src/app.ts');
        expect(input.commitDiff).toContain('+new');
        expect(input.recentCommitSubjects).toContain('fix(changes): old message');
    });
});
