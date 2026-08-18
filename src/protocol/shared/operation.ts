export enum OperationStatus {
    Running = 'running',
    Success = 'success',
    Delegated = 'delegated',
    Failed = 'failed',
    Conflict = 'conflict',
}

export enum OperationNoticeActionKind {
    ShowOutput = 'showOutput',
    Retry = 'retry',
}
