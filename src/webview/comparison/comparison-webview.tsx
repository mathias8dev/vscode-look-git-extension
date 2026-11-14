import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ComparisonChannel, ComparisonRequest, ComparisonResponse } from '@protocol/comparison/messages';
import { ComparisonMode } from '@protocol/comparison/types';
import type { WebviewFontSizeChangedPush } from '@protocol/shared/ui';
import { ComparisonApp } from '@webview/features/comparison/comparison-app';
import { initialComparisonState, reduceComparisonState } from '@webview/features/comparison/comparison-state';
import { applyWebviewFontSize, isWebviewFontSizeMessage } from '@webview/platform/font-size';
import { vscodeApi } from '@webview/platform/vscode-host';

type Request = Exclude<ComparisonRequest, { readonly type: 'comparison/cancel' }>;

export function ComparisonWebview() {
    const [state, dispatch] = useReducer(reduceComparisonState, initialComparisonState);
    const requests = useRef(new Map<ComparisonChannel, { readonly request: Request; readonly append: boolean; readonly cancelled: boolean }>());
    const send = useCallback((channel: ComparisonChannel, request: Request, append = false) => {
        requests.current.set(channel, { request, append, cancelled: false });
        dispatch({ type: 'started', channel, request, append });
        vscodeApi.postMessage(request);
    }, []);

    useEffect(() => {
        const listener = (event: MessageEvent<ComparisonResponse | WebviewFontSizeChangedPush>) => {
            if (isWebviewFontSizeMessage(event.data)) { applyWebviewFontSize(event.data.fontSize); return; }
            dispatch({ type: 'message', message: event.data });
            const initRequest = requests.current.get('init');
            if (event.data.type === 'comparison/init' && !initRequest?.cancelled && initRequest?.request.requestId === event.data.requestId) {
                send('comparison', { type: 'comparison/dataRequest', requestId: crypto.randomUUID(), baseBranch: event.data.baseBranch, headBranch: event.data.headBranch, mode: ComparisonMode.SinceDivergence });
            }
        };
        window.addEventListener('message', listener);
        send('init', { type: 'comparison/ready', requestId: crypto.randomUUID() });
        return () => window.removeEventListener('message', listener);
    }, [send]);

    const snapshotId = state.snapshot?.id;
    useEffect(() => {
        if (!snapshotId || !state.selectedCommit || state.tab !== 'commits') return;
        send('details', { type: 'comparison/detailsRequest', requestId: crypto.randomUUID(), snapshotId, hash: state.selectedCommit, search: '' });
        return () => { const message: ComparisonRequest = { type: 'comparison/cancel', channel: 'details' }; vscodeApi.postMessage(message); };
    }, [snapshotId, state.selectedCommit, state.tab, send]);

    return <ComparisonApp state={state} actions={{
        compare: settings => send('comparison', { type: 'comparison/dataRequest', requestId: crypto.randomUUID(), ...settings }),
        branches: (search, cursor) => send('branches', { type: 'comparison/branchesRequest', requestId: crypto.randomUUID(), search, cursor }, Boolean(cursor)),
        files: (search, more = false) => {
            if (!snapshotId) return;
            send('files', { type: 'comparison/filesRequest', requestId: crypto.randomUUID(), snapshotId, search, cursor: more ? state.files?.cursor : undefined }, more);
        },
        commits: (search, more = false) => { if (snapshotId) send('commits', { type: 'comparison/commitsRequest', requestId: crypto.randomUUID(), snapshotId, search, cursor: more ? state.commits?.cursor : undefined }, more); },
        selectFile: path => {
            dispatch({ type: 'selectFile', path });
            const file = state.files?.items.find(item => item.filePath === path);
            if (snapshotId && file && !file.isSubmodule && file.additions !== null && file.deletions !== null) {
                send('open', { type: 'comparison/openDiff', requestId: crypto.randomUUID(), snapshotId, filePath: path });
            }
        },
        selectCommit: hash => { if (hash !== state.selectedCommit) dispatch({ type: 'selectCommit', hash }); },
        details: (search, more = false) => { if (snapshotId && state.selectedCommit) send('details', { type: 'comparison/detailsRequest', requestId: crypto.randomUUID(), snapshotId, hash: state.selectedCommit, search, cursor: more ? state.details?.files.cursor : undefined }, more); },
        tab: tab => dispatch({ type: 'tab', tab }),
        review: path => dispatch({ type: 'review', path }),
        openDiff: (file, commitHash) => { if (snapshotId) send('open', { type: 'comparison/openDiff', requestId: crypto.randomUUID(), snapshotId, filePath: file.filePath, commitHash, parentHash: file.parentHash }); },
        retry: channel => { const previous = requests.current.get(channel); if (previous) send(channel, { ...previous.request, requestId: crypto.randomUUID() }, previous.append); },
        cancel: channel => {
            const previous = requests.current.get(channel);
            if (previous) { requests.current.set(channel, { ...previous, cancelled: true }); }
            dispatch({ type: 'cancel', channel });
            const message: ComparisonRequest = { type: 'comparison/cancel', channel };
            vscodeApi.postMessage(message);
        },
    }} />;
}
