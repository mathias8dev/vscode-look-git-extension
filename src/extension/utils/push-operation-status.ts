import { GitPushOutcome } from '@application/ports/git-capabilities';
import { OperationStatus } from '@protocol/shared/operation';

export function pushOperationStatus(outcome: GitPushOutcome): OperationStatus {
    switch (outcome) {
        case GitPushOutcome.Completed: return OperationStatus.Success;
        case GitPushOutcome.Delegated: return OperationStatus.Delegated;
        case GitPushOutcome.Cancelled: return OperationStatus.Cancelled;
        case GitPushOutcome.NotPushed: return OperationStatus.NotPushed;
    }
}
