import { OperationAction, type ActiveConflictState } from './operationCommands';
import { ConflictState } from '../../../protocol/changes/types';

interface OperationBannerProps {
    readonly conflictState: ActiveConflictState;
    readonly conflictCount: number;
    readonly conflictsOnly: boolean;
    readonly onToggleConflictsOnly: () => void;
    readonly onAction: (action: OperationAction) => void;
}

export function OperationBanner({ conflictState, conflictCount, conflictsOnly, onToggleConflictsOnly, onAction }: OperationBannerProps) {
    const hasConflicts = conflictCount > 0;
    return (
        <section className="changes-banner" aria-label="Operation in progress">
            <div>
                <strong>{operationLabel(conflictState)} in progress</strong>
                <span>{operationHelpText(conflictCount)}</span>
            </div>
            <div className="operation-actions">
                <button
                    type="button"
                    disabled={!hasConflicts}
                    title={hasConflicts ? 'Open the first conflict in the merge editor' : 'No conflicts to open'}
                    onClick={() => onAction(OperationAction.OpenFirstMergeEditor)}
                >
                    Open First
                </button>
                <button
                    type="button"
                    disabled={!hasConflicts}
                    title={hasConflicts ? 'Open all conflicts in the merge editor' : 'No conflicts to open'}
                    onClick={() => onAction(OperationAction.OpenAllMergeEditors)}
                >
                    Open All
                </button>
                <button
                    type="button"
                    disabled={!hasConflicts}
                    onClick={onToggleConflictsOnly}
                >
                    {conflictsOnly ? 'Show All Changes' : 'Show Conflicts Only'}
                </button>
                <button
                    type="button"
                    disabled={hasConflicts}
                    title={hasConflicts ? 'Resolve all conflicts before continuing' : 'Continue the current operation'}
                    onClick={() => onAction(OperationAction.Continue)}
                >
                    Continue
                </button>
                <button type="button" onClick={() => onAction(OperationAction.Abort)}>Abort</button>
                <button
                    type="button"
                    disabled={!hasConflicts}
                    onClick={() => onAction(OperationAction.AcceptAllTheirs)}
                >
                    Accept All Theirs
                </button>
            </div>
        </section>
    );
}

function operationHelpText(count: number): string {
    if (count === 0) { return 'All conflicts are resolved. Continue to finish the operation.'; }
    const label = count === 1 ? '1 unresolved conflict' : `${count} unresolved conflicts`;
    return `${label}. Open a conflict, resolve it, then continue.`;
}

function operationLabel(state: ActiveConflictState): string {
    return state === ConflictState.Merge ? 'Merge' : 'Rebase';
}
