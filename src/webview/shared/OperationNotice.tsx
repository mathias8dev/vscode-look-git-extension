import { OperationStatus } from '../../protocol/shared/operation';
import { Codicon, type CodiconName } from './Codicon';

export interface OperationNoticeAction {
    readonly label: string;
    readonly title?: string;
    readonly disabled?: boolean;
    readonly onClick: () => void;
}

interface OperationNoticeProps {
    readonly status: OperationStatus;
    readonly message: string;
    readonly detail?: string;
    readonly actions?: readonly OperationNoticeAction[];
}

export function OperationNotice({ status, message, detail, actions = [] }: OperationNoticeProps) {
    return (
        <section
            className={`operation-notice operation-notice-${status}`}
            role={status === OperationStatus.Failed || status === OperationStatus.Conflict ? 'alert' : 'status'}
            aria-live="polite"
        >
            <Codicon name={iconForStatus(status)} spin={status === OperationStatus.Running} />
            <div className="operation-notice-content">
                <strong>{message}</strong>
                {detail ? <span>{detail}</span> : null}
            </div>
            {actions.length > 0 ? (
                <div className="operation-notice-actions">
                    {actions.map((action) => (
                        <button
                            key={action.label}
                            type="button"
                            title={action.title}
                            disabled={action.disabled}
                            onClick={action.onClick}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

function iconForStatus(status: OperationStatus): CodiconName {
    switch (status) {
        case OperationStatus.Running:
            return 'loading';
        case OperationStatus.Success:
            return 'check';
        case OperationStatus.Failed:
            return 'error';
        case OperationStatus.Conflict:
            return 'warning';
    }
}
