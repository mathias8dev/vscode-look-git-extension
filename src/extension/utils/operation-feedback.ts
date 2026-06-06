import { OperationNoticeActionKind, OperationStatus } from '../../protocol/shared/operation';

export function operationActionsForStatus(status: OperationStatus): readonly OperationNoticeActionKind[] | undefined {
    return status === OperationStatus.Failed || status === OperationStatus.Conflict
        ? [OperationNoticeActionKind.ShowOutput]
        : undefined;
}
