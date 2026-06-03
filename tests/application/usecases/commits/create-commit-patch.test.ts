import { describe, expect, it, vi } from 'vitest';
import { CreateCommitPatchUseCase } from '../../../../src/application/usecases/commits/create-commit-patch';
import type { SaveFilePort } from '../../../../src/application/ports/save-file';
import type { TextFileWriterPort } from '../../../../src/application/ports/text-file-writer';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('CreateCommitPatchUseCase', () => {
    it('asks for a patch path, formats commits oldest-first, and writes the patch file', async () => {
        const saveFile = saveFileMock('/repo/export.patch');
        const writer = textFileWriterMock();
        const repo = makeRepositoryMock({
            cwd: '/repo',
            exec: vi.fn(async () => 'newer\nolder\n'),
            execRaw: vi.fn(async (args) => `patch:${args.at(-1)}`),
        });

        await new CreateCommitPatchUseCase(saveFile, writer).execute(repo, ['older', 'newer']);

        expect(saveFile.showSaveFile).toHaveBeenCalledWith({
            defaultDirectory: '/repo',
            defaultFileName: 'older.patch',
            filters: { Patches: ['patch', 'diff'] },
        });
        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'older']);
        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'newer']);
        expect(writer.writeTextFile).toHaveBeenCalledWith('/repo/export.patch', 'patch:older\npatch:newer');
    });

    it('does not format patches when save is cancelled', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });

        await new CreateCommitPatchUseCase(saveFileMock(undefined), textFileWriterMock()).execute(repo, ['abc123']);

        expect(repo.execRaw).not.toHaveBeenCalled();
    });
});

function saveFileMock(path: string | undefined): SaveFilePort {
    return {
        showSaveFile: vi.fn(async () => path),
    };
}

function textFileWriterMock(): TextFileWriterPort {
    return {
        writeTextFile: vi.fn(async () => undefined),
    };
}
