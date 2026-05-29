import type { ProtocolError } from '../../protocol/shared/base';

interface ErrorNoticeProps {
    readonly error: ProtocolError | undefined;
}

export function ErrorNotice({ error }: ErrorNoticeProps) {
    if (!error) { return null; }
    return (
        <section className="error-notice" role="alert">
            <strong>{error.message}</strong>
            {error.operation ? <span>{error.operation}</span> : null}
        </section>
    );
}
