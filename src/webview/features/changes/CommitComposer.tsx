import { useState } from 'react';
import type { CommitMode, ConflictState } from '../../../protocol/changes/types';
import type { CommitFeedback } from './changesState';
import { COMMIT_MODE_OPTIONS, canSubmitCommit, commitBlockReason } from './commitComposerModel';

interface CommitComposerProps {
    readonly stagedCount: number;
    readonly conflictState: ConflictState;
    readonly feedback: CommitFeedback | undefined;
    readonly onCommit: (message: string, mode: CommitMode) => void;
}

export function CommitComposer({ stagedCount, conflictState, feedback, onCommit }: CommitComposerProps) {
    const [message, setMessage] = useState('');
    const blockedReason = commitBlockReason({ message, mode: 'commit', stagedCount, conflictState });

    return (
        <section className="commit-composer" aria-label="Commit composer">
            <textarea
                value={message}
                rows={3}
                placeholder="Commit message"
                onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <div className="commit-meta">
                <span>{stagedCount} staged</span>
                {blockedReason ? <span>{blockedReason}</span> : feedbackText(feedback)}
            </div>
            <div className="commit-actions">
                {COMMIT_MODE_OPTIONS.map((option) => (
                    <button
                        key={option.mode}
                        type="button"
                        disabled={!canSubmitCommit({ message, mode: option.mode, stagedCount, conflictState })}
                        onClick={() => onCommit(message, option.mode)}
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
