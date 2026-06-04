import { useEffect, useRef, useState } from 'react';
import { CommitMode, ConflictState } from '../../../protocol/changes/types';
import type { ProtocolError } from '../../../protocol/shared/base';
import type { CommitFeedback, GeneratedCommitMessage } from './changesState';
import { canSubmitCommit, commitBlockReason } from './commitComposerModel';

interface CommitComposerProps {
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
    readonly feedback: CommitFeedback | undefined;
    readonly focusRequest: number;
    readonly generatingMessage: boolean;
    readonly generatedMessage: GeneratedCommitMessage | undefined;
    readonly generationError: ProtocolError | undefined;
    readonly showGenerateMessage?: boolean;
    readonly onGenerateMessage: () => void;
    readonly onCommit: (message: string, mode: CommitMode) => void;
}

interface CommitOption {
    readonly mode: CommitMode;
    readonly label: string;
    readonly icon: string;
}

const MORE_OPTIONS: readonly CommitOption[] = [
    { mode: CommitMode.Amend, label: 'Amend Last Commit', icon: 'git-commit' },
    { mode: CommitMode.CommitPush, label: 'Commit & Push', icon: 'cloud-upload' },
    { mode: CommitMode.CommitSync, label: 'Commit & Sync', icon: 'repo-sync' },
];

export function CommitComposer({
    stagedCount,
    conflictState,
    feedback,
    focusRequest,
    generatingMessage,
    generatedMessage,
    generationError,
    showGenerateMessage = true,
    onGenerateMessage,
    onCommit,
}: CommitComposerProps) {
    const [message, setMessage] = useState('');
    const [showMore, setShowMore] = useState(false);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const appliedGeneratedRequestIdRef = useRef<string | undefined>(undefined);

    const canCommit = canSubmitCommit({ message, mode: CommitMode.Commit, stagedCount, conflictState });
    const blockedReason = commitBlockReason({ message, mode: CommitMode.Commit, stagedCount, conflictState });
    const canGenerateMessage = showGenerateMessage && stagedCount > 0 && conflictState === ConflictState.None && !generatingMessage;

    useEffect(() => {
        if (!showMore) { return; }
        const firstButton = dropdownRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
        firstButton?.focus();
    }, [showMore]);

    useEffect(() => {
        if (focusRequest === 0) { return; }
        textAreaRef.current?.focus();
    }, [focusRequest]);

    useEffect(() => {
        if (!generatedMessage) { return; }
        if (appliedGeneratedRequestIdRef.current === generatedMessage.requestId) { return; }
        appliedGeneratedRequestIdRef.current = generatedMessage.requestId;
        setMessage(generatedMessage.message);
        textAreaRef.current?.focus();
    }, [generatedMessage]);

    useEffect(() => {
        if (!showMore) { return; }
        const handler = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowMore(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMore]);

    const closeDropdown = () => {
        setShowMore(false);
        triggerRef.current?.focus();
    };

    const submitCommit = (mode: CommitMode) => {
        if (!canSubmitCommit({ message, mode, stagedCount, conflictState })) { return; }
        onCommit(message.trim(), mode);
        setMessage('');
        setShowMore(false);
    };

    const handleDropdownKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDropdown();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const buttons = Array.from(
                dropdownRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [],
            );
            const idx = buttons.indexOf(document.activeElement as HTMLElement);
            const next = event.key === 'ArrowDown'
                ? (buttons[idx + 1] ?? buttons[0])
                : (buttons[idx - 1] ?? buttons[buttons.length - 1]);
            next?.focus();
        }
    };

    return (
        <section className="commit-composer" aria-label="Commit composer">
            <textarea
                ref={textAreaRef}
                className="commit-message-input"
                value={message}
                rows={3}
                placeholder="Message (Ctrl+Enter to commit)"
                aria-label="Commit message"
                onChange={(event) => setMessage(event.currentTarget.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        submitCommit(CommitMode.Commit);
                    }
                }}
            />
            {generationError ? (
                <span className="commit-hint commit-hint-error">{generationError.message}</span>
            ) : !canCommit && blockedReason ? (
                <span className="commit-hint">{blockedReason}</span>
            ) : feedback && !feedback.success ? (
                <span className="commit-hint commit-hint-error">{feedback.message}</span>
            ) : feedback?.success ? (
                <span className="commit-hint">Committed successfully.</span>
            ) : null}
            <div ref={wrapperRef} className="commit-primary-row">
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
                <button
                    type="button"
                    className={`commit-main-button${showGenerateMessage ? ' commit-main-button-with-generate' : ''}`}
                    disabled={!canCommit}
                    onClick={() => submitCommit(CommitMode.Commit)}
                >
                    <i className="codicon codicon-git-commit" aria-hidden="true" />
                    <span className="commit-button-label">Commit</span>
                </button>
                <div className="commit-more-wrapper">
                    <button
                        ref={triggerRef}
                        type="button"
                        className="commit-more-trigger"
                        title="More commit options"
                        aria-label="More commit options"
                        aria-expanded={showMore}
                        aria-haspopup="menu"
                        onClick={() => setShowMore(!showMore)}
                    >
                        <i className="codicon codicon-chevron-down" aria-hidden="true" />
                    </button>
                    {showMore ? (
                        <div
                            ref={dropdownRef}
                            className="commit-dropdown"
                            role="menu"
                            onKeyDown={handleDropdownKeyDown}
                        >
                            {MORE_OPTIONS.map((option) => {
                                const enabled = canSubmitCommit({ message, mode: option.mode, stagedCount, conflictState });
                                return (
                                    <button
                                        key={option.mode}
                                        type="button"
                                        role="menuitem"
                                        disabled={!enabled}
                                        onClick={() => submitCommit(option.mode)}
                                    >
                                        <i className={`codicon codicon-${option.icon}`} aria-hidden="true" />
                                        <span className="commit-button-label">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
