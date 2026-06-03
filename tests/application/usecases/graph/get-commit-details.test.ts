import { describe, expect, it, vi } from 'vitest';
import { GetCommitDetailsUseCase } from '../../../../src/application/usecases/graph/get-commit-details';
import type { GitFileChange } from '../../../../src/core/git/domain/GitCommit';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('GetCommitDetailsUseCase', () => {
    it('loads commit message and changed files', async () => {
        const files: readonly GitFileChange[] = [{
            status: 'M',
            filePath: 'src/app.ts',
            parentHash: 'parent',
        }];
        const repo = makeRepositoryMock({
            getCommitFiles: vi.fn(async () => files),
            getCommitMessage: vi.fn(async () => 'feat(graph): add details\n\nBody'),
        });

        const result = await new GetCommitDetailsUseCase().execute(repo, 'abc123');

        expect(result).toEqual({
            hash: 'abc123',
            fullMessage: 'feat(graph): add details\n\nBody',
            files: [{
                status: 'M',
                filePath: 'src/app.ts',
                parentHash: 'parent',
            }],
        });
        expect(repo.getCommitFiles).toHaveBeenCalledWith('abc123', undefined);
        expect(repo.getCommitMessage).toHaveBeenCalledWith('abc123', undefined);
    });
});
