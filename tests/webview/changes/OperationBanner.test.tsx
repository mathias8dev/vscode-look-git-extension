// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConflictState } from '../../../src/protocol/changes/types';
import { OperationBanner } from '../../../src/webview/features/changes/OperationBanner';
import { OperationAction } from '../../../src/webview/features/changes/operationCommands';

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

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(onAction).toHaveBeenCalledWith(OperationAction.Continue);
    });
});
