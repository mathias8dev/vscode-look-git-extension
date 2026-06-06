import { OperationNoticeActionKind } from '../../protocol/shared/operation';
import type { OperationNoticeAction } from './OperationNotice';

interface OperationNoticeActionHandlers {
    readonly onShowOutput?: () => void;
    readonly onRetry?: () => void;
    readonly onDismiss?: () => void;
}

export function operationNoticeActions(
    actions: readonly OperationNoticeActionKind[] | undefined,
    handlers: OperationNoticeActionHandlers,
    options: { readonly dismissible?: boolean } = {},
): readonly OperationNoticeAction[] {
    const result = (actions ?? []).flatMap((action) => {
        switch (action) {
            case OperationNoticeActionKind.ShowOutput:
                return handlers.onShowOutput
                    ? [{ label: 'Show Output', title: 'Open Look Git output', onClick: handlers.onShowOutput }]
                    : [];
            case OperationNoticeActionKind.Retry:
                return handlers.onRetry
                    ? [{ label: 'Retry', title: 'Run the operation again', onClick: handlers.onRetry }]
                    : [];
        }
    });
    if (options.dismissible && handlers.onDismiss) {
        return [...result, { label: 'Dismiss', title: 'Dismiss this operation notice', onClick: handlers.onDismiss }];
    }
    return result;
}
