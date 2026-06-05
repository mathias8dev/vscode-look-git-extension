import { describe, expect, it, vi } from 'vitest';
import { CommitReferenceActions } from '../../../../src/application/usecases/commits/commit-reference-actions';
import type { ClipboardPort } from '../../../../src/application/ports/clipboard';
import type { TextInputPort } from '../../../../src/application/ports/text-input';
import { TextInputValidationSeverity } from '../../../../src/application/ports/text-input';
import { makeRepositoryMock } from '../../../helpers/repositoryMock';

describe('CommitReferenceActions', () => {
    it('copies the selected revision number', async () => {
        const clipboard = clipboardMock();
        const actions = new CommitReferenceActions(clipboard, textInputMock());

        await actions.copyRevisionNumber('abc123');

        expect(clipboard.writeText).toHaveBeenCalledWith('abc123');
    });

    it('creates a branch at a commit when the user enters a name', async () => {
        const repo = makeRepositoryMock();
        const actions = new CommitReferenceActions(clipboardMock(), textInputMock('feature/at-commit'));

        await expect(actions.createBranchAtCommit(repo, 'abc123')).resolves.toBe(true);

        expect(repo.exec).toHaveBeenCalledWith(['branch', 'feature/at-commit', 'abc123']);
    });

    it('normalizes spaces in branch names created at a commit', async () => {
        const repo = makeRepositoryMock();
        const actions = new CommitReferenceActions(clipboardMock(), textInputMock('feature at commit'));

        await expect(actions.createBranchAtCommit(repo, 'abc123')).resolves.toBe(true);

        expect(repo.exec).toHaveBeenCalledWith(['branch', 'feature-at-commit', 'abc123']);
    });

    it('provides branch name validation with a normalized preview', async () => {
        const repo = makeRepositoryMock();
        const textInput = textInputMock('feature bad:name');
        const actions = new CommitReferenceActions(clipboardMock(), textInput);

        await actions.createBranchAtCommit(repo, 'abc123');

        const options = vi.mocked(textInput.showInput).mock.calls[0]?.[0];
        expect(options?.validateInput?.('feature bad:name')).toEqual({
            message: 'feature bad:name -> feature-bad-name',
            severity: TextInputValidationSeverity.Info,
        });
        expect(options?.validateInput?.('HEAD')).toEqual({
            message: 'HEAD is reserved.',
            severity: TextInputValidationSeverity.Error,
        });
    });

    it('skips branch creation when the user cancels', async () => {
        const repo = makeRepositoryMock();
        const actions = new CommitReferenceActions(clipboardMock(), textInputMock(undefined));

        await expect(actions.createBranchAtCommit(repo, 'abc123')).resolves.toBe(false);

        expect(repo.exec).not.toHaveBeenCalled();
    });

    it('creates a tag at a commit when the user enters a name', async () => {
        const repo = makeRepositoryMock();
        const actions = new CommitReferenceActions(clipboardMock(), textInputMock('v1.2.3'));

        await expect(actions.createTagAtCommit(repo, 'abc123')).resolves.toBe(true);

        expect(repo.exec).toHaveBeenCalledWith(['tag', 'v1.2.3', 'abc123']);
    });
});

function clipboardMock(): ClipboardPort {
    return {
        writeText: vi.fn(async () => undefined),
    };
}

function textInputMock(value?: string): TextInputPort {
    return {
        showInput: vi.fn(async () => value),
    };
}
