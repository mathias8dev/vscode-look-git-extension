import { useEffect, useRef, useState } from 'react';
import type { VisualRebaseExtensionToWebviewMessage, VisualRebaseRecommendedAction, VisualRebaseWebviewToExtensionMessage } from '@protocol/visual-rebase/messages';
import type { VisualRebaseCommit, VisualRebaseConflictFile, VisualRebasePlanEntry, VisualRebaseRef, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { VisualRebaseApp } from '@webview/features/visual-rebase/visual-rebase-app';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';
import { vscodeApi } from '@webview/platform/vscode-host';
import { messageForVisualRebaseAbort, messageForVisualRebaseAcceptIncoming, messageForVisualRebaseAcceptYours, messageForVisualRebaseCancel, messageForVisualRebaseContinue, messageForVisualRebaseMarkResolved, messageForVisualRebaseOpenFile, messageForVisualRebaseOpenMergeEditor, messageForVisualRebasePreview, messageForVisualRebaseReady, messageForVisualRebaseSkip, messageForVisualRebaseStart } from '@webview/visual-rebase/visual-rebase-commands';

export function VisualRebaseWebview() {
    const [title, setTitle] = useState('Visual Rebase');
    const [currentBranch, setCurrentBranch] = useState('');
    const [upstream, setUpstream] = useState('');
    const [onto, setOnto] = useState('');
    const [commits, setCommits] = useState<readonly VisualRebaseCommit[]>([]);
    const [safety, setSafety] = useState<VisualRebaseSafety | undefined>(undefined);
    const [refs, setRefs] = useState<readonly VisualRebaseRef[]>([]);
    const [previewRunning, setPreviewRunning] = useState(false);
    const [running, setRunning] = useState(false);
    const [completedBackupRef, setCompletedBackupRef] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [conflictFiles, setConflictFiles] = useState<readonly VisualRebaseConflictFile[]>([]);
    const [rebaseInProgress, setRebaseInProgress] = useState(false);
    const [recommendedAction, setRecommendedAction] = useState<VisualRebaseRecommendedAction | undefined>(undefined);
    const lastPreviewRequestId = useRef<string | undefined>(undefined);

    useEffect(() => {
        const onMessage = (event: MessageEvent<VisualRebaseExtensionToWebviewMessage>) => {
            if (isWebviewFontSizeMessage(event.data)) {
                applyWebviewFontSize(event.data.fontSize);
                return;
            }
            switch (event.data.type) {
                case 'visualRebase/init':
                    setTitle(event.data.title);
                    setCurrentBranch(event.data.currentBranch);
                    setUpstream(event.data.upstream);
                    setOnto(event.data.onto);
                    setCommits(event.data.commits);
                    setSafety(event.data.safety);
                    setRefs(event.data.refs);
                    return;
                case 'visualRebase/started':
                    setRunning(true);
                    setError(undefined);
                    setConflictFiles([]);
                    setRebaseInProgress(false);
                    setRecommendedAction(undefined);
                    return;
                case 'visualRebase/completed':
                    setRunning(false);
                    setCompletedBackupRef(event.data.backupRef);
                    setConflictFiles([]);
                    setRebaseInProgress(false);
                    setRecommendedAction(undefined);
                    return;
                case 'visualRebase/error':
                    setRunning(false);
                    setError(event.data.message);
                    setConflictFiles(event.data.conflictFiles ?? []);
                    setRebaseInProgress(event.data.rebaseInProgress === true);
                    setRecommendedAction(event.data.recommendedAction);
                    return;
                case 'visualRebase/previewResponse':
                    if (event.data.requestId !== lastPreviewRequestId.current) { return; }
                    setPreviewRunning(false);
                    if (event.data.error) {
                        setError(event.data.error);
                        return;
                    }
                    setError(undefined);
                    setUpstream(event.data.rewriteAfter);
                    setOnto(event.data.replayOnto);
                    setCommits(event.data.commits ?? []);
                    if (event.data.safety) { setSafety(event.data.safety); }
                    return;
            }
        };
        window.addEventListener('message', onMessage);
        postToExtension(messageForVisualRebaseReady());
        return () => window.removeEventListener('message', onMessage);
    }, []);

    const appKey = visualRebaseAppKey(currentBranch, upstream, onto, commits);

    return (
        <VisualRebaseApp
            key={appKey}
            title={title}
            currentBranch={currentBranch}
            upstream={upstream}
            onto={onto}
            initialCommits={commits}
            safety={safety}
            refs={refs}
            previewRunning={previewRunning}
            running={running}
            completedBackupRef={completedBackupRef}
            error={error}
            conflictFiles={conflictFiles}
            rebaseInProgress={rebaseInProgress}
            recommendedAction={recommendedAction}
            onStart={(rewriteAfter: string, replayOnto: string, plan: readonly VisualRebasePlanEntry[]) => postToExtension(messageForVisualRebaseStart(rewriteAfter, replayOnto, plan))}
            onPreview={(rewriteAfter: string, replayOnto: string) => {
                const requestId = requestIdForVisualRebase();
                lastPreviewRequestId.current = requestId;
                setPreviewRunning(true);
                postToExtension(messageForVisualRebasePreview(requestId, rewriteAfter, replayOnto));
            }}
            onContinue={() => postToExtension(messageForVisualRebaseContinue())}
            onAbort={() => postToExtension(messageForVisualRebaseAbort())}
            onSkip={() => postToExtension(messageForVisualRebaseSkip())}
            onOpenMergeEditor={(filePath: string) => postToExtension(messageForVisualRebaseOpenMergeEditor(filePath))}
            onOpenFile={(filePath: string) => postToExtension(messageForVisualRebaseOpenFile(filePath))}
            onMarkResolved={(filePath: string) => postToExtension(messageForVisualRebaseMarkResolved(filePath))}
            onAcceptYours={(filePath: string) => postToExtension(messageForVisualRebaseAcceptYours(filePath))}
            onAcceptIncoming={(filePath: string) => postToExtension(messageForVisualRebaseAcceptIncoming(filePath))}
            onCancel={() => postToExtension(messageForVisualRebaseCancel())}
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
