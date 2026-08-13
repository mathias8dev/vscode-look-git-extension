import type { VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { Codicon } from '@webview/shared/codicon';
import { Modal } from '@webview/shared/modal';

interface VisualRebaseRiskConfirmationProps {
    readonly isOpen: boolean;
    readonly currentBranch: string;
    readonly rewriteAfter: string;
    readonly replayOnto: string;
    readonly commitCount: number;
    readonly safety: VisualRebaseSafety;
    readonly onConfirm: () => void;
    readonly onClose: () => void;
}

export function VisualRebaseRiskConfirmation({
    isOpen,
    currentBranch,
    rewriteAfter,
    replayOnto,
    commitCount,
    safety,
    onConfirm,
    onClose,
}: VisualRebaseRiskConfirmationProps) {
    const published = safety.pushedCommits > 0;
    return (
        <Modal
            isOpen={isOpen}
            title={published ? 'Rewrite Published Commits?' : 'Start with Working Tree Changes?'}
            className="visual-rebase-risk-modal"
            closeOnBackdropClick={false}
            onClose={onClose}
        >
            <div className="visual-rebase-risk-summary">
                <strong>{commitCount} commits on {currentBranch}</strong>
                <span>{rewriteAfter}..{currentBranch} onto {replayOnto}</span>
            </div>
            <ul className="visual-rebase-risk-list">
                {published ? (
                    <li data-state="warning">
                        <Codicon name="warning" />
                        <span>{safety.pushedCommits} published {safety.pushedCommits === 1 ? 'commit will' : 'commits will'} require a force-with-lease push.</span>
                    </li>
                ) : null}
                {!safety.workingTreeClean ? (
                    <li data-state="warning">
                        <Codicon name="warning" />
                        <span>Working tree changes will be autostashed and restored by Git.</span>
                    </li>
                ) : null}
                <li data-state="ok">
                    <Codicon name="check" />
                    <span>Backup ref: {safety.backupRef}</span>
                </li>
            </ul>
            <div className="visual-rebase-risk-actions">
                <button type="button" className="visual-rebase-button" onClick={onClose}>Review Plan</button>
                <button type="button" className="visual-rebase-primary" onClick={onConfirm}>Start Rebase</button>
            </div>
        </Modal>
    );
}
