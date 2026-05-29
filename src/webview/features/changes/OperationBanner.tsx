import { OperationAction, type ActiveConflictState } from './operationCommands';
import { ConflictState } from '../../../protocol/changes/types';

interface OperationBannerProps {
    readonly conflictState: ActiveConflictState;
    readonly conflictCount: number;
    readonly onAction: (action: OperationAction) => void;
}

export function OperationBanner({ conflictState, conflictCount, onAction }: OperationBannerProps) {
    return (
        <section className="changes-banner" aria-label="Operation in progress">
            <div>
                <strong>{operationLabel(conflictState)} in progress</strong>
                <span>{conflictCountText(conflictCount)}</span>
            </div>
            <div className="operation-actions">
                <button type="button" onClick={() => onAction(OperationAction.AcceptAllTheirs)}>Accept All Theirs</button>
                <button type="button" onClick={() => onAction(OperationAction.Continue)}>Continue</button>
                <button type="button" onClick={() => onAction(OperationAction.Abort)}>Abort</button>
            </div>
        </section>
    );
}

function conflictCountText(count: number): string {
    return count === 1 ? '1 unresolved conflict' : `${count} unresolved conflicts`;
}

function operationLabel(state: ActiveConflictState): string {
    return state === ConflictState.Merge ? 'Merge' : 'Rebase';
}
