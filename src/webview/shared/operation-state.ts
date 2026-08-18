import { OperationStatus } from '@protocol/shared/operation';

interface OperationState {
    readonly operationId: string;
    readonly status: OperationStatus;
}

export function nextOperationStatus<T extends OperationState>(current: T | undefined, message: T): T | undefined {
    if (message.status !== OperationStatus.Running && current?.operationId && current.operationId !== message.operationId) {
        return current;
    }
    return message.status === OperationStatus.Delegated ? undefined : message;
}
