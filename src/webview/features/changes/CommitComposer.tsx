import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CommitMode, ConflictState } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import type { CommitFeedback, GeneratedCommitMessage } from './changesState';
import { canSubmitCommit, commitBlockReason } from './commitComposerModel';
import { changesCommitComposerContext } from './context-menu-model';

interface CommitComposerProps {
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
    readonly feedback: CommitFeedback | undefined;
    readonly focusRequest: number;
    readonly generatingMessage: boolean;
    readonly generatedMessage: GeneratedCommitMessage | undefined;
    readonly generationError: ProtocolError | undefined;
    readonly showGenerateMessage?: boolean;
    readonly targetLabel?: string;
    readonly submodulePath?: string;
    readonly onGenerateMessage: () => void;
    readonly onCommit: (message: string, mode: CommitMode) => void;
    readonly onOpenNativeMenu: (message: string, submodulePath: string | undefined) => void;
}

export function CommitComposer({
    stagedCount,
    conflictState,
    feedback,
    focusRequest,
    generatingMessage,
    generatedMessage,
    generationError,
    showGenerateMessage = true,
    targetLabel,
    submodulePath,
    onGenerateMessage,
    onCommit,
    onOpenNativeMenu,
}: CommitComposerProps) {
    const [message, setMessage] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const appliedGeneratedRequestIdRef = useRef<string | undefined>(undefined);
    const appliedSuccessFeedbackRef = useRef<CommitFeedback | undefined>(undefined);
    const ignoreSyntheticContextMenuRef = useRef(false);

    const canCommit = canSubmitCommit({ message, mode: CommitMode.Commit, stagedCount, conflictState });
    const blockedReason = commitBlockReason({ message, mode: CommitMode.Commit, stagedCount, conflictState });
    const canGenerateMessage = showGenerateMessage && stagedCount > 0 && conflictState === ConflictState.None && !generatingMessage;

    useEffect(() => {
        if (focusRequest === 0) { return; }
        inputRef.current?.focus();
    }, [focusRequest]);

    useEffect(() => {
        if (!generatedMessage) { return; }
        if (appliedGeneratedRequestIdRef.current === generatedMessage.requestId) { return; }
        appliedGeneratedRequestIdRef.current = generatedMessage.requestId;
        setMessage(generatedMessage.message);
        inputRef.current?.focus();
    }, [generatedMessage]);

    useEffect(() => {
        if (!feedback?.success) { return; }
        if (appliedSuccessFeedbackRef.current === feedback) { return; }
        appliedSuccessFeedbackRef.current = feedback;
        setMessage('');
    }, [feedback]);

    // Grow the textarea to fit the message (multiline), capped by CSS max-height.
    useEffect(() => {
        const textarea = inputRef.current;
        if (!textarea) { return; }
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, [message]);

    const submitCommit = (mode: CommitMode) => {
        if (!canSubmitCommit({ message, mode, stagedCount, conflictState })) { return; }
        onCommit(message.trim(), mode);
        setMessage('');
    };

    const rememberNativeMenuTarget = () => {
        onOpenNativeMenu(message, submodulePath);
    };

    const handleNativeMenuContext = () => {
        if (ignoreSyntheticContextMenuRef.current) {
            ignoreSyntheticContextMenuRef.current = false;
            return;
        }
        rememberNativeMenuTarget();
    };

    const handleNativeMenuClick = (event: MouseEvent<HTMLButtonElement>) => {
        rememberNativeMenuTarget();
        openNativeCommitMenu(event, ignoreSyntheticContextMenuRef);
    };

    return (
        <section className="commit-composer" aria-label="Commit composer">
            <div className="commit-message-field">
                <textarea
                    ref={inputRef}
                    className="commit-message-input"
                    rows={1}
                    value={message}
                    placeholder={commitPlaceholder(targetLabel)}
                    aria-label="Commit message"
                    onChange={(event) => setMessage(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.preventDefault();
                            submitCommit(CommitMode.Commit);
                        }
                    }}
                />
                {showGenerateMessage ? (
                    <button
                        type="button"
                        className="commit-generate-button"
                        disabled={!canGenerateMessage}
                        title={generatingMessage ? 'Generating commit message' : 'Generate commit message'}
                        aria-label={generatingMessage ? 'Generating commit message' : 'Generate commit message'}
                        onClick={onGenerateMessage}
                    >
                        <i className={`codicon ${generatingMessage ? 'codicon-loading codicon-modifier-spin' : 'codicon-sparkle'}`} aria-hidden="true" />
                    </button>
                ) : null}
            </div>
            {generationError ? (
                <span className="commit-hint commit-hint-error">{generationError.message}</span>
            ) : message.trim() && !canCommit && blockedReason ? (
                <span className="commit-hint">{blockedReason}</span>
            ) : feedback && !feedback.success ? (
                <span className="commit-hint commit-hint-error">{feedback.message}</span>
            ) : feedback?.success ? (
                <span className="commit-hint">Committed successfully.</span>
            ) : null}
            <div className="commit-primary-row">
                <button
                    type="button"
                    className="commit-main-button"
                    disabled={!canCommit}
                    onClick={() => submitCommit(CommitMode.Commit)}
                >
                    <i className="codicon codicon-git-commit" aria-hidden="true" />
                    <span className="commit-button-label">Commit</span>
                </button>
                <div className="commit-more-wrapper">
                    <button
                        type="button"
                        className="commit-more-trigger"
                        title="More commit options"
                        aria-label="More commit options"
                        aria-haspopup="menu"
                        data-vscode-context={changesCommitComposerContext()}
                        onContextMenu={handleNativeMenuContext}
                        onClick={handleNativeMenuClick}
                    >
                        <i className="codicon codicon-chevron-down" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </section>
    );
}

function commitPlaceholder(targetLabel: string | undefined): string {
    const target = targetLabel?.trim();
    return target
        ? `Message (Ctrl+Enter to commit on "${target}")`
        : 'Message (Ctrl+Enter to commit)';
}

function openNativeCommitMenu(
    event: MouseEvent<HTMLButtonElement>,
    ignoreSyntheticContextMenuRef: { current: boolean },
): void {
    const rect = event.currentTarget.getBoundingClientRect();
    ignoreSyntheticContextMenuRef.current = true;
    event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: rect.right,
        clientY: rect.bottom,
    }));
    queueMicrotask(() => {
        ignoreSyntheticContextMenuRef.current = false;
    });
}
