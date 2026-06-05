import type { ProtocolError } from '../../protocol/shared/base';

interface ErrorNoticeProps {
    readonly error: ProtocolError | undefined;
    readonly primaryAction?: ErrorNoticeAction;
    readonly secondaryAction?: ErrorNoticeAction;
}

interface ErrorNoticeAction {
    readonly label: string;
    readonly onClick: () => void;
}

export function ErrorNotice({ error, primaryAction, secondaryAction }: ErrorNoticeProps) {
    if (!error) { return null; }
    return (
        <section className="error-notice" role="alert">
            <div className="error-notice-content">
                <strong>{error.message}</strong>
                {error.operation ? <span>{error.operation}</span> : null}
            </div>
            {primaryAction || secondaryAction ? (
                <div className="error-notice-actions">
                    {primaryAction ? (
                        <button type="button" className="error-notice-action-primary" onClick={primaryAction.onClick}>
                            {primaryAction.label}
                        </button>
                    ) : null}
                    {secondaryAction ? (
                        <button type="button" className="error-notice-action-secondary" onClick={secondaryAction.onClick}>
                            {secondaryAction.label}
                        </button>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}
