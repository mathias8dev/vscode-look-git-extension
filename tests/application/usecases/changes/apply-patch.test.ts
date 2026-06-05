import { describe, expect, it, vi } from 'vitest';
import { ApplyPatchMode, ApplyPatchResultKind, ApplyPatchUseCase } from '../../../../src/application/usecases/changes/apply-patch';
import { ConflictState } from '../../../../src/protocol/changes/types';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('ApplyPatchUseCase', () => {
    it('preflights a patch against the working tree', async () => {
        const repo = makeRepositoryMock();

        await new ApplyPatchUseCase().preflight(repo, '/tmp/change.patch', ApplyPatchMode.WorkingTree);

        expect(repo.exec).toHaveBeenCalledWith(['apply', '--check', '--3way', '/tmp/change.patch']);
    });

    it('preflights a patch against the index', async () => {
        const repo = makeRepositoryMock();

        await new ApplyPatchUseCase().preflight(repo, '/tmp/change.patch', ApplyPatchMode.Index);

        expect(repo.exec).toHaveBeenCalledWith(['apply', '--check', '--3way', '--index', '/tmp/change.patch']);
    });

    it('applies a patch and reports conflicts from repository status', async () => {
        const repo = makeRepositoryMock({
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'src/app.ts' }],
                conflictState: ConflictState.Merge,
            })),
        });

        const result = await new ApplyPatchUseCase().execute(repo, '/tmp/change.patch', ApplyPatchMode.Index);

        expect(repo.exec).toHaveBeenCalledWith(['apply', '--3way', '--index', '/tmp/change.patch']);
        expect(result).toEqual({ kind: ApplyPatchResultKind.AppliedWithConflicts });
    });

    it('reports clean application when no conflicts remain', async () => {
        const repo = makeRepositoryMock();

        const result = await new ApplyPatchUseCase().execute(repo, '/tmp/change.patch', ApplyPatchMode.WorkingTree);

        expect(repo.exec).toHaveBeenCalledWith(['apply', '--3way', '/tmp/change.patch']);
        expect(result).toEqual({ kind: ApplyPatchResultKind.Applied });
    });
});
