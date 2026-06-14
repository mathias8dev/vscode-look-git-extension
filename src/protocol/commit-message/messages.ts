import type { RequestId } from '../shared/base';

export interface CommitMessageInitPush {
    readonly type: 'commitMessage/init';
    readonly title: string;
    readonly message: string;
    readonly canGenerate: boolean;
}

export interface CommitMessageGeneratingPush {
    readonly type: 'commitMessage/generating';
    readonly requestId: RequestId;
}

export interface CommitMessageGeneratedResponse {
    readonly type: 'commitMessage/generated';
    readonly requestId: RequestId;
    readonly message: string;
}

export interface CommitMessageGenerationErrorResponse {
    readonly type: 'commitMessage/generationError';
    readonly requestId: RequestId;
    readonly message: string;
}

export interface CommitMessageReadyMessage {
    readonly type: 'commitMessage/ready';
}

export interface CommitMessageGenerateRequest {
    readonly type: 'commitMessage/generate';
    readonly requestId: RequestId;
}

export interface CommitMessageApplyMessage {
    readonly type: 'commitMessage/apply';
    readonly message: string;
}

export interface CommitMessageCancelMessage {
    readonly type: 'commitMessage/cancel';
}

export type CommitMessageExtensionToWebviewMessage =
    | CommitMessageInitPush
    | CommitMessageGeneratingPush
    | CommitMessageGeneratedResponse
    | CommitMessageGenerationErrorResponse;

export type CommitMessageWebviewToExtensionMessage =
    | CommitMessageReadyMessage
    | CommitMessageGenerateRequest
    | CommitMessageApplyMessage
    | CommitMessageCancelMessage;
