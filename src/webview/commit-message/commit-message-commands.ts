import type { CommitMessageWebviewToExtensionMessage } from '../../protocol/commit-message/messages';

export function messageForCommitMessageReady(): CommitMessageWebviewToExtensionMessage {
    return { type: 'commitMessage/ready' };
}

export function messageForCommitMessageGenerate(requestId: string): CommitMessageWebviewToExtensionMessage {
    return { type: 'commitMessage/generate', requestId };
}

export function messageForCommitMessageApply(message: string): CommitMessageWebviewToExtensionMessage {
    return { type: 'commitMessage/apply', message };
}

export function messageForCommitMessageCancel(): CommitMessageWebviewToExtensionMessage {
    return { type: 'commitMessage/cancel' };
}
