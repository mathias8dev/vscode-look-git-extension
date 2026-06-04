import { describe, expect, it, vi } from 'vitest';
import { CreateCommitPatchResultKind, CreateCommitPatchUseCase } from '../../../../src/application/usecases/commits/create-commit-patch';
import type { ClipboardPort } from '../../../../src/application/ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '../../../../src/application/ports/commit-patch-destination';
import type { SaveFilePort } from '../../../../src/application/ports/save-file';
import type { TextFileWriterPort } from '../../../../src/application/ports/text-file-writer';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('CreateCommitPatchUseCase', () => {
    it('formats commits oldest-first and copies the patch to the clipboard', async () => {
        const clipboard = clipboardMock();
        const repo = makeRepositoryMock({
            cwd: '/repo',
            exec: vi.fn(async () => 'newer\nolder\n'),
            execRaw: vi.fn(async (args) => `patch:${args.at(-1)}`),
        });

        const result = await new CreateCommitPatchUseCase(
            destinationPickerMock(CommitPatchDestination.Clipboard),
            saveFileMock('/repo/export.patch'),
            textFileWriterMock(),
            clipboard,
        ).execute(repo, ['older', 'newer']);

        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'older']);
        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'newer']);
        expect(clipboard.writeText).toHaveBeenCalledWith('patch:older\npatch:newer');
        expect(result).toEqual({ kind: CreateCommitPatchResultKind.CopiedToClipboard });
    });

    it('asks for a patch path, formats commits oldest-first, and writes the patch file', async () => {
        const saveFile = saveFileMock('/repo/export.patch');
        const writer = textFileWriterMock();
        const repo = makeRepositoryMock({
            cwd: '/repo',
            exec: vi.fn(async () => 'newer\nolder\n'),
            execRaw: vi.fn(async (args) => `patch:${args.at(-1)}`),
        });

        const result = await new CreateCommitPatchUseCase(
            destinationPickerMock(CommitPatchDestination.File),
            saveFile,
            writer,
            clipboardMock(),
        ).execute(repo, ['older', 'newer']);

        expect(saveFile.showSaveFile).toHaveBeenCalledWith({
            defaultDirectory: '/repo',
            defaultFileName: 'older.patch',
            filters: { Patches: ['patch', 'diff'] },
        });
        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'older']);
        expect(repo.execRaw).toHaveBeenCalledWith(['format-patch', '-1', '--stdout', 'newer']);
        expect(writer.writeTextFile).toHaveBeenCalledWith('/repo/export.patch', 'patch:older\npatch:newer');
        expect(result).toEqual({ kind: CreateCommitPatchResultKind.SavedToFile, filePath: '/repo/export.patch' });
    });

    it('does not format patches when save is cancelled', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });

        const result = await new CreateCommitPatchUseCase(
            destinationPickerMock(CommitPatchDestination.File),
            saveFileMock(undefined),
            textFileWriterMock(),
            clipboardMock(),
        ).execute(repo, ['abc123']);

        expect(repo.execRaw).not.toHaveBeenCalled();
        expect(result).toEqual({ kind: CreateCommitPatchResultKind.Cancelled });
    });

    it('does not format patches when the destination prompt is cancelled', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });

        const result = await new CreateCommitPatchUseCase(
            destinationPickerMock(undefined),
            saveFileMock('/repo/export.patch'),
            textFileWriterMock(),
            clipboardMock(),
        ).execute(repo, ['abc123']);

        expect(repo.execRaw).not.toHaveBeenCalled();
        expect(result).toEqual({ kind: CreateCommitPatchResultKind.Cancelled });
    });
});

function destinationPickerMock(destination: CommitPatchDestination | undefined): CommitPatchDestinationPickerPort {
    return {
        pickCommitPatchDestination: vi.fn(async () => destination),
    };
}

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

function clipboardMock(): ClipboardPort {
    return {
        writeText: vi.fn(async () => undefined),
    };
}
