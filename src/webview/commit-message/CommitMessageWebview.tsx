import { useEffect, useRef, useState } from 'react';
import type { CommitMessageExtensionToWebviewMessage, CommitMessageWebviewToExtensionMessage } from '@protocol/commit-message/messages';
import { vscodeApi } from '@webview/platform/vscodeHost';
import { CommitMessageEditor } from '@webview/commit-message/CommitMessageEditor';
import {
    messageForCommitMessageApply,
    messageForCommitMessageCancel,
    messageForCommitMessageGenerate,
    messageForCommitMessageReady,
} from '@webview/commit-message/commit-message-commands';

export function CommitMessageWebview() {
    const [title, setTitle] = useState('Commit Message');
    const [message, setMessage] = useState('');
    const [canGenerate, setCanGenerate] = useState(false);
    const [generatingRequestId, setGeneratingRequestId] = useState<string | undefined>(undefined);
    const [generationError, setGenerationError] = useState<string | undefined>(undefined);
    const [focusToken, setFocusToken] = useState(0);
    const requestCounterRef = useRef(0);
    const activeGenerationRequestIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        const onMessage = (event: MessageEvent<CommitMessageExtensionToWebviewMessage>): void => {
            switch (event.data.type) {
                case 'commitMessage/init':
                    setTitle(event.data.title);
                    setMessage(event.data.message);
                    setCanGenerate(event.data.canGenerate);
                    setFocusToken((value) => value + 1);
                    return;
                case 'commitMessage/generating':
                    setGenerationError(undefined);
                    activeGenerationRequestIdRef.current = event.data.requestId;
                    setGeneratingRequestId(event.data.requestId);
                    return;
                case 'commitMessage/generated':
                    if (activeGenerationRequestIdRef.current !== event.data.requestId) { return; }
                    activeGenerationRequestIdRef.current = undefined;
                    setGeneratingRequestId(undefined);
                    setMessage(event.data.message);
                    setGenerationError(undefined);
                    setFocusToken((value) => value + 1);
                    return;
                case 'commitMessage/generationError':
                    if (activeGenerationRequestIdRef.current !== event.data.requestId) { return; }
                    activeGenerationRequestIdRef.current = undefined;
                    setGeneratingRequestId(undefined);
                    setGenerationError(event.data.message);
                    return;
            }
        };
        window.addEventListener('message', onMessage);
        postToExtension(messageForCommitMessageReady());
        return () => { window.removeEventListener('message', onMessage); };
    }, []);

    const generateMessage = () => {
        if (!canGenerate || generatingRequestId !== undefined) { return; }
        requestCounterRef.current += 1;
        const requestId = String(requestCounterRef.current);
        setGenerationError(undefined);
        activeGenerationRequestIdRef.current = requestId;
        setGeneratingRequestId(requestId);
        postToExtension(messageForCommitMessageGenerate(requestId));
    };

    return (
        <CommitMessageEditor
            title={title}
            message={message}
            canGenerate={canGenerate}
            generating={generatingRequestId !== undefined}
            generationError={generationError}
            focusToken={focusToken}
            onMessageChange={setMessage}
            onGenerate={generateMessage}
            onApply={() => postToExtension(messageForCommitMessageApply(message))}
            onCancel={() => postToExtension(messageForCommitMessageCancel())}
        />
    );
}

function postToExtension(message: CommitMessageWebviewToExtensionMessage): void {
    vscodeApi.postMessage(message);
}
