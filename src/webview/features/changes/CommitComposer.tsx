import { useState } from 'react';
import type { CommitMode, ConflictState } from '../../../protocol/changes/types';
import type { CommitFeedback } from './changesState';
import {
    COMMIT_MODE_OPTIONS,
    CONVENTIONAL_COMMIT_TYPES,
    buildCommitMessage,
    canSubmitCommit,
    commitBlockReason,
    messageStats,
    rememberCommitMessage,
    type ConventionalCommitType,
} from './commitComposerModel';

interface CommitComposerProps {
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
    readonly feedback: CommitFeedback | undefined;
    readonly onCommit: (message: string, mode: CommitMode) => void;
}

export function CommitComposer({ stagedCount, conflictState, feedback, onCommit }: CommitComposerProps) {
    const [message, setMessage] = useState('');
    const [type, setType] = useState<ConventionalCommitType>('');
    const [scope, setScope] = useState('');
    const [history, setHistory] = useState<readonly string[]>([]);
    const finalMessage = buildCommitMessage({ type, scope, message });
    const blockedReason = commitBlockReason({ message: finalMessage, mode: 'commit', stagedCount, conflictState });
    const stats = messageStats(finalMessage);

    const submitCommit = (mode: CommitMode) => {
        if (!canSubmitCommit({ message: finalMessage, mode, stagedCount, conflictState })) { return; }
        onCommit(finalMessage, mode);
        setHistory((current) => rememberCommitMessage(current, finalMessage));
        setMessage('');
        setScope('');
        setType('');
    };

    return (
        <section className="commit-composer" aria-label="Commit composer">
            <div className="commit-options">
                <select
                    value={type}
                    aria-label="Conventional commit type"
                    onChange={(event) => setType(event.currentTarget.value as ConventionalCommitType)}
                >
                    {CONVENTIONAL_COMMIT_TYPES.map((option) => (
                        <option key={option || 'none'} value={option}>{option || 'Type'}</option>
                    ))}
                </select>
                <input
                    type="text"
                    value={scope}
                    placeholder="Scope"
                    aria-label="Conventional commit scope"
                    disabled={!type}
                    onChange={(event) => setScope(event.currentTarget.value)}
                />
                <select
                    value=""
                    aria-label="Recent commit messages"
                    disabled={history.length === 0}
                    onChange={(event) => setMessage(event.currentTarget.value)}
                >
                    <option value="">Recent</option>
                    {history.map((entry) => (
                        <option key={entry} value={entry}>{entry.split(/\r?\n/)[0]}</option>
                    ))}
                </select>
            </div>
            <textarea
                value={message}
                rows={3}
                placeholder="Commit message"
                onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <div className="commit-meta">
                <span>{stagedCount} staged</span>
                <span>{stats.lines} lines, {stats.characters} chars</span>
                {blockedReason ? <span>{blockedReason}</span> : feedbackText(feedback)}
            </div>
            <div className="commit-actions">
                {COMMIT_MODE_OPTIONS.map((option) => (
                    <button
                        key={option.mode}
                        type="button"
                        disabled={!canSubmitCommit({ message: finalMessage, mode: option.mode, stagedCount, conflictState })}
                        onClick={() => submitCommit(option.mode)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </section>
    );
}

function feedbackText(feedback: CommitFeedback | undefined) {
    if (!feedback) { return null; }
    return <span>{feedback.success ? 'Committed.' : feedback.message}</span>;
}
