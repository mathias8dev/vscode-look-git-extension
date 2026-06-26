import type { GenerateCommitMessageRequest, GenerateSubmoduleCommitMessageRequest } from '@protocol/changes/messages';

let requestCounter = 0;

export function messageForGenerateCommitMessage(): GenerateCommitMessageRequest {
    return {
        type: 'changes/generateCommitMessage',
        requestId: `changes:generate-commit-message:${++requestCounter}`,
    };
}

export function messageForGenerateSubmoduleCommitMessage(submodulePath: string): GenerateSubmoduleCommitMessageRequest {
    return {
        type: 'changes/generateSubmoduleCommitMessage',
        requestId: `changes:generate-submodule-commit-message:${++requestCounter}`,
        submodulePath,
    };
}
