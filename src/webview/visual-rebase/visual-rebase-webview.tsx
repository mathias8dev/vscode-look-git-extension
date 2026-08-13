import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import type { VisualRebaseExtensionToWebviewMessage, VisualRebaseWebviewToExtensionMessage } from '@protocol/visual-rebase/messages';
import type { VisualRebaseCommit, VisualRebasePlanEntry } from '@protocol/visual-rebase/types';
import { VisualRebaseApp } from '@webview/features/visual-rebase/visual-rebase-app';
import { initialVisualRebaseState, reduceVisualRebaseState } from '@webview/features/visual-rebase/visual-rebase-state';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';
import { vscodeApi } from '@webview/platform/vscode-host';
import { messageForVisualRebaseAbort, messageForVisualRebaseAcceptIncoming, messageForVisualRebaseAcceptYours, messageForVisualRebaseCancel, messageForVisualRebaseCommitDetails, messageForVisualRebaseContinue, messageForVisualRebaseMarkResolved, messageForVisualRebaseOpenCommitDiff, messageForVisualRebaseOpenFile, messageForVisualRebaseOpenMergeEditor, messageForVisualRebasePreview, messageForVisualRebaseReady, messageForVisualRebaseSkip, messageForVisualRebaseStart } from '@webview/visual-rebase/visual-rebase-commands';

export function VisualRebaseWebview() {
    const [state, dispatch] = useReducer(reduceVisualRebaseState, initialVisualRebaseState);
    const lastPreviewRequestId = useRef<string | undefined>(undefined);

    useEffect(() => {
        const onMessage = (event: MessageEvent<VisualRebaseExtensionToWebviewMessage>) => {
            if (isWebviewFontSizeMessage(event.data)) {
                applyWebviewFontSize(event.data.fontSize);
                return;
            }
            if (event.data.type === 'visualRebase/previewResponse'
                && event.data.requestId !== lastPreviewRequestId.current) { return; }
            dispatch({ type: 'message', message: event.data });
        };
        window.addEventListener('message', onMessage);
        postToExtension(messageForVisualRebaseReady());
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const requestCommitDetails = useCallback((hash: string) => {
        const requestId = requestIdForVisualRebase();
        dispatch({ type: 'commitDetailsStarted', requestId, hash });
        postToExtension(messageForVisualRebaseCommitDetails(requestId, hash));
    }, []);

    const openCommitDiff = useCallback((hash: string, file: CommitFileChange) => {
        postToExtension(messageForVisualRebaseOpenCommitDiff(hash, file));
    }, []);

    const appKey = visualRebaseAppKey(state.currentBranch, state.upstream, state.onto, state.commits);

    return (
        <VisualRebaseApp
            key={appKey}
            title={state.title}
            currentBranch={state.currentBranch}
            upstream={state.upstream}
            onto={state.onto}
            initialCommits={state.commits}
            safety={state.safety}
            refs={state.refs}
            previewRunning={state.previewRunning}
            previewError={state.previewError}
            phase={state.phase}
            running={state.running}
            operation={state.operation}
            completedBackupRef={state.completedBackupRef}
            notice={state.notice}
            conflictFiles={state.conflictFiles}
            commitDetails={state.commitDetails}
            commitDetailsLoading={state.commitDetailsLoading}
            commitDetailsError={state.commitDetailsError}
            onStart={(rewriteAfter: string, replayOnto: string, plan: readonly VisualRebasePlanEntry[]) => postToExtension(messageForVisualRebaseStart(rewriteAfter, replayOnto, plan))}
            onPreview={(rewriteAfter: string, replayOnto: string) => {
                const requestId = requestIdForVisualRebase();
                lastPreviewRequestId.current = requestId;
                dispatch({ type: 'previewStarted' });
                postToExtension(messageForVisualRebasePreview(requestId, rewriteAfter, replayOnto));
            }}
            onContinue={() => postToExtension(messageForVisualRebaseContinue())}
            onAbort={() => postToExtension(messageForVisualRebaseAbort())}
            onSkip={() => postToExtension(messageForVisualRebaseSkip())}
            onOpenMergeEditor={(filePath: string) => postToExtension(messageForVisualRebaseOpenMergeEditor(filePath))}
            onOpenFile={(filePath: string) => postToExtension(messageForVisualRebaseOpenFile(filePath))}
            onSelectCommit={requestCommitDetails}
            onOpenCommitDiff={openCommitDiff}
            onMarkResolved={(filePath: string) => postToExtension(messageForVisualRebaseMarkResolved(filePath))}
            onAcceptYours={(filePath: string) => postToExtension(messageForVisualRebaseAcceptYours(filePath))}
            onAcceptIncoming={(filePath: string) => postToExtension(messageForVisualRebaseAcceptIncoming(filePath))}
            onCancel={() => postToExtension(messageForVisualRebaseCancel())}
            onReviewPlan={() => dispatch({ type: 'reviewPlan' })}
        />
    );
}

function requestIdForVisualRebase(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function postToExtension(message: VisualRebaseWebviewToExtensionMessage): void {
    vscodeApi.postMessage(message);
}

function visualRebaseAppKey(
    currentBranch: string,
    upstream: string,
    onto: string,
    commits: readonly VisualRebaseCommit[],
): string {
    return [
        currentBranch,
        upstream,
        onto,
        commits.map((commit) => `${commit.hash}:${commit.message}`).join('|'),
    ].join('\n');
}
