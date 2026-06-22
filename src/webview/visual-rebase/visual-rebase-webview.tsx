import { useEffect, useState } from 'react';
import type { VisualRebaseExtensionToWebviewMessage, VisualRebaseRecommendedAction, VisualRebaseWebviewToExtensionMessage } from '@protocol/visual-rebase/messages';
import type { VisualRebaseCommit, VisualRebasePlanEntry, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { VisualRebaseApp } from '@webview/features/visual-rebase/visual-rebase-app';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';
import { vscodeApi } from '@webview/platform/vscode-host';
import { messageForVisualRebaseAbort, messageForVisualRebaseAcceptIncoming, messageForVisualRebaseAcceptYours, messageForVisualRebaseCancel, messageForVisualRebaseContinue, messageForVisualRebaseMarkResolved, messageForVisualRebaseOpenMergeEditor, messageForVisualRebaseReady, messageForVisualRebaseSkip, messageForVisualRebaseStart } from '@webview/visual-rebase/visual-rebase-commands';

export function VisualRebaseWebview() {
    const [title, setTitle] = useState('Visual Rebase');
    const [currentBranch, setCurrentBranch] = useState('');
    const [upstream, setUpstream] = useState('');
    const [onto, setOnto] = useState('');
    const [commits, setCommits] = useState<readonly VisualRebaseCommit[]>([]);
    const [safety, setSafety] = useState<VisualRebaseSafety | undefined>(undefined);
    const [running, setRunning] = useState(false);
    const [completedBackupRef, setCompletedBackupRef] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | undefined>(undefined);
    const [conflictFiles, setConflictFiles] = useState<readonly string[]>([]);
    const [rebaseInProgress, setRebaseInProgress] = useState(false);
    const [recommendedAction, setRecommendedAction] = useState<VisualRebaseRecommendedAction | undefined>(undefined);

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
            running={running}
            completedBackupRef={completedBackupRef}
            error={error}
            conflictFiles={conflictFiles}
            rebaseInProgress={rebaseInProgress}
            recommendedAction={recommendedAction}
            onStart={(plan: readonly VisualRebasePlanEntry[]) => postToExtension(messageForVisualRebaseStart(plan))}
            onContinue={() => postToExtension(messageForVisualRebaseContinue())}
            onAbort={() => postToExtension(messageForVisualRebaseAbort())}
            onSkip={() => postToExtension(messageForVisualRebaseSkip())}
            onOpenMergeEditor={(filePath: string) => postToExtension(messageForVisualRebaseOpenMergeEditor(filePath))}
            onMarkResolved={(filePath: string) => postToExtension(messageForVisualRebaseMarkResolved(filePath))}
            onAcceptYours={(filePath: string) => postToExtension(messageForVisualRebaseAcceptYours(filePath))}
            onAcceptIncoming={(filePath: string) => postToExtension(messageForVisualRebaseAcceptIncoming(filePath))}
            onCancel={() => postToExtension(messageForVisualRebaseCancel())}
        />
    );
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
