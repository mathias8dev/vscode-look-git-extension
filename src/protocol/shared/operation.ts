export enum OperationStatus {
    Running = 'running',
    Success = 'success',
    Delegated = 'delegated',
    Cancelled = 'cancelled',
    NotPushed = 'notPushed',
    Failed = 'failed',
    Conflict = 'conflict',
}

export enum OperationNoticeActionKind {
    ShowOutput = 'showOutput',
    Retry = 'retry',
}
