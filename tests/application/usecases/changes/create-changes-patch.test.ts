import { describe, expect, it, vi } from 'vitest';
import type { ClipboardPort } from '../../../../src/application/ports/clipboard';
import { CommitPatchDestination, type CommitPatchDestinationPickerPort } from '../../../../src/application/ports/commit-patch-destination';
import type { SaveFilePort } from '../../../../src/application/ports/save-file';
import type { TextFileWriterPort } from '../../../../src/application/ports/text-file-writer';
import { CreateChangesPatchResultKind, CreateChangesPatchUseCase } from '../../../../src/application/usecases/changes/create-changes-patch';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('CreateChangesPatchUseCase', () => {
    it('copies staged and unstaged selected changes as a patch', async () => {
        const clipboard = clipboardMock();
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args.includes('--cached') ? 'staged patch\n' : 'unstaged patch\n'),
        });

        const result = await useCase(CommitPatchDestination.Clipboard, clipboard).execute(repo, {
            stagedFilePaths: ['src/staged.ts'],
            unstagedFilePaths: ['src/app.ts'],
            untrackedFilePaths: [],
        });

        expect(repo.execRaw).toHaveBeenNthCalledWith(1, ['diff', '--cached', '--binary', '--', 'src/staged.ts']);
        expect(repo.execRaw).toHaveBeenNthCalledWith(2, ['diff', '--binary', '--', 'src/app.ts']);
        expect(clipboard.writeText).toHaveBeenCalledWith('staged patch\n\nunstaged patch\n');
        expect(result).toEqual({ kind: CreateChangesPatchResultKind.CopiedToClipboard });
    });

    it('writes selected changes to a patch file', async () => {
        const writer = textFileWriterMock();
        const repo = makeRepositoryMock({
            cwd: '/repo',
            execRaw: vi.fn(async () => 'patch body\n'),
        });

        const result = await new CreateChangesPatchUseCase(
            destinationPickerMock(CommitPatchDestination.File),
            saveFileMock('/repo/selected.patch'),
            writer,
            clipboardMock(),
        ).execute(repo, {
            stagedFilePaths: [],
            unstagedFilePaths: ['src/app.ts'],
            untrackedFilePaths: [],
        });

        expect(writer.writeTextFile).toHaveBeenCalledWith('/repo/selected.patch', 'patch body\n');
        expect(result).toEqual({ kind: CreateChangesPatchResultKind.SavedToFile, filePath: '/repo/selected.patch' });
    });

    it('includes untracked selected files using no-index diff output', async () => {
        const clipboard = clipboardMock();
        const diffError = Object.assign(new Error('git diff exits with 1 when files differ'), {
            stdout: 'untracked patch\n',
        });
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => {
                throw diffError;
            }),
        });

        await useCase(CommitPatchDestination.Clipboard, clipboard).execute(repo, {
            stagedFilePaths: [],
            unstagedFilePaths: [],
            untrackedFilePaths: ['src/new.ts'],
        });

        expect(repo.execRaw).toHaveBeenCalledWith(['diff', '--binary', '--no-index', '--', '/dev/null', 'src/new.ts']);
        expect(clipboard.writeText).toHaveBeenCalledWith('untracked patch\n');
    });

    it('does not generate a patch when the destination is cancelled', async () => {
        const repo = makeRepositoryMock();

        const result = await useCase(undefined, clipboardMock()).execute(repo, {
            stagedFilePaths: ['src/staged.ts'],
            unstagedFilePaths: [],
            untrackedFilePaths: [],
        });

        expect(repo.execRaw).not.toHaveBeenCalled();
        expect(result).toEqual({ kind: CreateChangesPatchResultKind.Cancelled });
    });
});

function useCase(destination: CommitPatchDestination | undefined, clipboard: ClipboardPort): CreateChangesPatchUseCase {
    return new CreateChangesPatchUseCase(
        destinationPickerMock(destination),
        saveFileMock('/repo/selected.patch'),
        textFileWriterMock(),
        clipboard,
    );
}

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
