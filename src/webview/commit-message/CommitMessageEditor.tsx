import { useEffect, useRef } from 'react';
import { Codicon } from '@webview/shared/Codicon';

interface CommitMessageEditorProps {
    readonly title: string;
    readonly message: string;
    readonly canGenerate: boolean;
    readonly generating: boolean;
    readonly generationError: string | undefined;
    readonly focusToken: number;
    readonly onMessageChange: (message: string) => void;
    readonly onGenerate: () => void;
    readonly onApply: () => void;
    readonly onCancel: () => void;
}

export function CommitMessageEditor({
    title,
    message,
    canGenerate,
    generating,
    generationError,
    focusToken,
    onMessageChange,
    onGenerate,
    onApply,
    onCancel,
}: CommitMessageEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const messageLengthRef = useRef(message.length);

    useEffect(() => {
        messageLengthRef.current = message.length;
    }, [message.length]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(messageLengthRef.current, messageLengthRef.current);
        });
        return () => cancelAnimationFrame(frame);
    }, [focusToken]);

    const canCommit = message.trim().length > 0;

    return (
        <main className="commit-message-editor">
            <header className="commit-message-editor-header">
                <h1>{title}</h1>
                <button
                    className="commit-message-editor-icon-button"
                    type="button"
                    title="Cancel"
                    aria-label="Cancel"
                    onClick={onCancel}
                >
                    <Codicon name="close" />
                </button>
            </header>
            <textarea
                ref={textareaRef}
                className="commit-message-editor-textarea"
                value={message}
                spellCheck="false"
                onChange={(event) => { onMessageChange(event.target.value); }}
            />
            <div className="commit-message-editor-bottom">
                <footer className="commit-message-editor-actions">
                    <div className="commit-message-editor-secondary-actions">
                        {canGenerate ? (
                            <button
                                className="commit-message-editor-generate"
                                type="button"
                                disabled={generating}
                                title={generating ? 'Generating commit message' : 'Generate commit message'}
                                aria-label={generating ? 'Generating commit message' : 'Generate commit message'}
                                onClick={onGenerate}
                            >
                                <Codicon name={generating ? 'loading' : 'sparkle'} spin={generating} />
                                <span>Generate</span>
                            </button>
                        ) : null}
                    </div>
                    <button
                        className="commit-message-editor-commit"
                        type="button"
                        disabled={!canCommit}
                        onClick={onApply}
                    >
                        <Codicon name="check" />
                        <span>Commit</span>
                    </button>
                </footer>
                {generationError ? (
                    <div className="commit-message-editor-error" role="alert">{generationError}</div>
                ) : null}
            </div>
        </main>
    );
}
