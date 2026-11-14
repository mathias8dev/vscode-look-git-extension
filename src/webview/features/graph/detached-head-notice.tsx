import { Codicon } from '@webview/shared/codicon';

interface DetachedHeadNoticeProps {
    readonly label: string;
    readonly previousBranch: string | undefined;
    readonly busy: boolean;
    readonly onReturn: () => void;
    readonly onCreateBranch: () => void;
}

export function DetachedHeadNotice({ label, previousBranch, busy, onReturn, onCreateBranch }: DetachedHeadNoticeProps) {
    return (
        <div className="graph-detached-notice" role="status">
            <Codicon name="info" />
            <div className="graph-detached-copy">
                <strong>Viewing {label} · Detached HEAD</strong>
                <span>Create a branch to start working from this version.</span>
            </div>
            <div className="graph-detached-actions">
                {previousBranch ? <button type="button" disabled={busy} onClick={onReturn}>Return to {previousBranch}</button> : null}
                <button type="button" disabled={busy} onClick={onCreateBranch}>Create Branch…</button>
            </div>
        </div>
    );
}
