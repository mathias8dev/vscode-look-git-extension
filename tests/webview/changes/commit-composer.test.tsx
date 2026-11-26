// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CommitResultStatus } from '@protocol/changes/commit-result-status';
import { CommitMode, ConflictState } from '@protocol/changes/types';
import { CommitComposer } from '@webview/features/changes/commit-composer';

describe('CommitComposer', () => {
    afterEach(cleanup);

    it.each([CommitResultStatus.Cancelled, CommitResultStatus.Failed])('keeps the draft and allows retry after %s', status => {
        const onCommit = vi.fn();
        const props = composerProps(onCommit);
        const { rerender } = render(<CommitComposer {...props} />);
        const input = screen.getByRole('textbox', { name: 'Commit message' });
        fireEvent.change(input, { target: { value: 'feat: preserve the draft' } });

        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
        rerender(<CommitComposer {...props} feedback={{ status: CommitResultStatus.Running, message: undefined }} />);
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        expect(onCommit).toHaveBeenCalledExactlyOnceWith('feat: preserve the draft', CommitMode.Commit);
        expect(input).toBeDisabled();
        expect(input).toHaveValue('feat: preserve the draft');

        rerender(<CommitComposer {...props} feedback={{ status, message: status === CommitResultStatus.Failed ? 'Commit failed' : undefined }} />);

        expect(input).not.toBeDisabled();
        expect(input).toHaveValue('feat: preserve the draft');
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
        expect(onCommit).toHaveBeenCalledTimes(2);
    });

    it('clears the draft only after a successful commit', () => {
        const props = composerProps(vi.fn());
        const { rerender } = render(<CommitComposer {...props} />);
        const input = screen.getByRole('textbox', { name: 'Commit message' });
        fireEvent.change(input, { target: { value: 'feat: commit' } });
        fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });

        rerender(<CommitComposer {...props} feedback={{ status: CommitResultStatus.Success, message: undefined }} />);

        expect(input).toHaveValue('');
        expect(input).not.toBeDisabled();
    });
});

function composerProps(onCommit: (message: string, mode: CommitMode) => void) {
    return {
        stagedCount: 1,
        conflictState: ConflictState.None,
        feedback: undefined,
        focusRequest: 0,
        generatingMessage: false,
        generatedMessage: undefined,
        generationError: undefined,
        onGenerateMessage: vi.fn(),
        onCommit,
        onOpenNativeMenu: vi.fn(),
    };
}
