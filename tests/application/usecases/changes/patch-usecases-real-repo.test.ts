import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommitPatchDestination } from '@application/ports/commit-patch-destination';
import { ApplyPatchMode, ApplyPatchResultKind, ApplyPatchUseCase } from '@application/usecases/changes/apply-patch';
import { CreateChangesPatchResultKind, CreateChangesPatchUseCase } from '@application/usecases/changes/create-changes-patch';
import { createSemanticRuntimeFixture } from '@tests/helpers/semantic-runtime-fixture';

describe('patch use cases on real repositories', () => {
    it('creates a selected-changes patch from staged, unstaged, and untracked files', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-usecase-create-patch-');
        try {
            const clipboard = new MemoryClipboard();
            const usecase = new CreateChangesPatchUseCase(
                { pickCommitPatchDestination: async () => CommitPatchDestination.Clipboard },
                { showSaveFile: async () => undefined },
                { writeTextFile: async () => undefined },
                clipboard,
            );

            const result = await usecase.execute(fixture.worktree, {
                stagedFilePaths: ['src/semantic-staged.ts'],
                unstagedFilePaths: ['README.md'],
                untrackedFilePaths: ['notes/semantic-untracked.md'],
            });

            expect(result.kind).toBe(CreateChangesPatchResultKind.CopiedToClipboard);
            expect(clipboard.text).toContain('src/semantic-staged.ts');
            expect(clipboard.text).toContain('README.md');
            expect(clipboard.text).toContain('notes/semantic-untracked.md');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);

    it('applies patches to the working tree and index with repository state validation', async () => {
        const fixture = await createSemanticRuntimeFixture('look-git-usecase-apply-patch-');
        try {
            const target = path.join(fixture.fixture.repo, 'src', 'usecase-patch.ts');
            fixture.git(['reset', '--hard', 'HEAD']);
            fixture.git(['clean', '-fd']);
            fs.writeFileSync(target, 'export const usecasePatch = "base";\n');
            fixture.git(['add', 'src/usecase-patch.ts']);
            fixture.git(['commit', '-m', 'test(changes): add usecase patch target']);
            fs.writeFileSync(target, 'export const usecasePatch = "changed";\n');
            const patch = await fixture.worktree.getPatch('workingTree', ['src/usecase-patch.ts']);
            await fixture.worktree.restoreWorkingTree(['src/usecase-patch.ts']);

            const usecase = new ApplyPatchUseCase();
            await usecase.preflight(fixture.worktree, patch, ApplyPatchMode.WorkingTree);
            await expect(usecase.execute(fixture.worktree, patch, ApplyPatchMode.WorkingTree)).resolves.toEqual({
                kind: ApplyPatchResultKind.Applied,
            });
            expect(fs.readFileSync(target, 'utf8')).toContain('changed');
            expect(fixture.git(['status', '--porcelain', '--', 'src/usecase-patch.ts'])).toContain(' M src/usecase-patch.ts');

            fixture.git(['reset', '--hard', 'HEAD']);
            await usecase.preflight(fixture.worktree, patch, ApplyPatchMode.Index);
            await expect(usecase.execute(fixture.worktree, patch, ApplyPatchMode.Index)).resolves.toEqual({
                kind: ApplyPatchResultKind.Applied,
            });
            expect(fixture.git(['status', '--porcelain', '--', 'src/usecase-patch.ts'])).toContain('M  src/usecase-patch.ts');
        } finally {
            fixture.cleanup();
        }
    }, 120_000);
});

class MemoryClipboard {
    text = '';

    async writeText(text: string): Promise<void> {
        this.text = text;
    }
}
