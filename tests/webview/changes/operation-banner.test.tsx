// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictState } from '@protocol/changes/types';
import { OperationBanner } from '@webview/features/changes/operation-banner';
import { OperationAction } from '@webview/features/changes/operation-commands';

describe('OperationBanner', () => {
    it('guides conflict resolution before enabling continue', () => {
        const onAction = vi.fn<(action: OperationAction) => void>();
        const onToggleConflictsOnly = vi.fn();
        const { rerender } = render(
            <OperationBanner
                conflictState={ConflictState.Merge}
                conflictCount={1}
                conflictsOnly={false}
                onToggleConflictsOnly={onToggleConflictsOnly}
                onAction={onAction}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Open First' }));
        fireEvent.click(screen.getByRole('button', { name: 'Show Conflicts Only' }));

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(screen.getByText('1 unresolved conflict. Continue is disabled until every conflict is resolved.')).toBeInTheDocument();
        expect(onAction).toHaveBeenCalledWith(OperationAction.OpenFirstMergeEditor);
        expect(onToggleConflictsOnly).toHaveBeenCalledTimes(1);

        rerender(
            <OperationBanner
                conflictState={ConflictState.Merge}
                conflictCount={0}
                conflictsOnly={false}
                onToggleConflictsOnly={onToggleConflictsOnly}
                onAction={onAction}
            />,
        );

        const continueButton = screen.getByRole('button', { name: 'Continue' });
        expect(continueButton).toHaveClass('operation-primary-action');
        expect(screen.getByLabelText('Operation in progress')).toHaveClass('changes-banner-ready');
        fireEvent.click(continueButton);
        expect(onAction).toHaveBeenCalledWith(OperationAction.Continue);
    });
});
