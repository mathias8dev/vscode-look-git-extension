interface VisualRebaseNoticeProps {
    readonly message: string;
    readonly details?: string;
    readonly tone: 'info' | 'warning' | 'error';
}

export function VisualRebaseNotice({ message, details, tone }: VisualRebaseNoticeProps) {
    return (
        <div className={`visual-rebase-notice visual-rebase-notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
            <span>{message}</span>
            {details && details !== message ? (
                <details>
                    <summary>Show Git output</summary>
                    <pre>{details}</pre>
                </details>
            ) : null}
        </div>
    );
}
