export type RequestId = string;

export interface Pagination {
    readonly offset: number;
    readonly limit: number;
}

export interface ErrorMessage {
    readonly type: 'error';
    readonly requestId?: RequestId;
    readonly message: string;
    readonly context?: string;
}
