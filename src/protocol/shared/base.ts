export type RequestId = string;

export type ErrorCode =
    | 'unknown'
    | 'cancelled'
    | 'noRepository'
    | 'validationFailed'
    | 'gitOperationFailed'
    | 'vscodeCommandFailed'
    | 'refreshFailed'
    | 'optionalDataUnavailable'
    | (string & {});

export interface ProtocolError {
    readonly code: ErrorCode;
    readonly message: string;
    readonly operation?: string;
    readonly recoverable: boolean;
    readonly details?: string;
}

export interface Pagination {
    readonly offset: number;
    readonly limit: number;
}

export type Resource<TData> =
    | LoadingResource
    | ReadyResource<TData>
    | FailedResource;

export interface LoadingResource {
    readonly status: 'loading';
}

export interface ReadyResource<TData> {
    readonly status: 'ready';
    readonly data: TData;
}

export interface FailedResource {
    readonly status: 'error';
    readonly error: ProtocolError;
}

export interface ErrorMessage {
    readonly type: 'error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly context?: string;
    readonly error: ProtocolError;
}
