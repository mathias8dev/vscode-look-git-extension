import type { VisualRebaseOperation } from '@protocol/visual-rebase/messages';
import { Codicon, type CodiconName } from '@webview/shared/codicon';
import { VisualRebaseNotice } from '@webview/features/visual-rebase/visual-rebase-notice';

interface VisualRebaseOperationStateProps {
    readonly state: 'loading' | 'running' | 'paused' | 'failed' | 'aborted';
    readonly branch: string;
    readonly replayOnto: string;
    readonly operation?: VisualRebaseOperation;
    readonly message?: string;
    readonly details?: string;
}

export function VisualRebaseOperationState({
    state,
    branch,
    replayOnto,
    operation,
    message,
    details,
}: VisualRebaseOperationStateProps) {
    const presentation = operationPresentation(state, operation, branch, replayOnto);
    return (
        <section className={`visual-rebase-operation visual-rebase-operation-${state}`} aria-label={presentation.heading}>
            <Codicon name={presentation.icon} spin={state === 'loading' || state === 'running'} />
            <h2>{presentation.heading}</h2>
            <p>{presentation.description}</p>
            {message ? (
                <VisualRebaseNotice
                    message={message}
                    details={details}
                    tone={state === 'failed' ? 'error' : 'info'}
                />
            ) : null}
        </section>
    );
}

interface OperationPresentation {
    readonly icon: CodiconName;
    readonly heading: string;
    readonly description: string;
}

function operationPresentation(
    state: VisualRebaseOperationStateProps['state'],
    operation: VisualRebaseOperation | undefined,
    branch: string,
    replayOnto: string,
): OperationPresentation {
    if (state === 'loading') {
        return {
            icon: 'loading',
            heading: 'Loading',
            description: 'Reading repository state.',
        };
    }
    if (state === 'running') {
        return {
            icon: 'loading',
            heading: operationHeading(operation),
            description: `${branch} onto ${replayOnto}`,
        };
    }
    if (state === 'paused') {
        return {
            icon: 'git-merge',
            heading: 'Rebase Paused',
            description: `${branch} is stopped at a planned commit.`,
        };
    }
    if (state === 'aborted') {
        return {
            icon: 'discard',
            heading: 'Rebase Aborted',
            description: `${branch} was restored to its pre-rebase state.`,
        };
    }
    return {
        icon: 'error',
        heading: 'Rebase Failed',
        description: `${branch} was not rewritten.`,
    };
}

function operationHeading(operation: VisualRebaseOperation | undefined): string {
    if (operation === 'continue') { return 'Continuing Rebase'; }
    if (operation === 'skip') { return 'Skipping Commit'; }
    if (operation === 'abort') { return 'Aborting Rebase'; }
    return 'Rebasing';
}
