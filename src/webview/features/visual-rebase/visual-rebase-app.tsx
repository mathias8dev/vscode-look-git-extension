import { useMemo, useState } from 'react';
import type { VisualRebaseRecommendedAction } from '@protocol/visual-rebase/messages';
import type { VisualRebaseAction, VisualRebaseCommit, VisualRebasePlanEntry, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { Codicon } from '@webview/shared/codicon';
import { Dropdown, type DropdownOption } from '@webview/shared/dropdown';
import { VisualRebaseConflictList } from '@webview/features/visual-rebase/visual-rebase-conflict-list';

interface VisualRebaseAppProps {
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly initialCommits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety | undefined;
    readonly running: boolean;
    readonly completedBackupRef: string | undefined;
    readonly error: string | undefined;
    readonly conflictFiles: readonly string[];
    readonly rebaseInProgress: boolean;
    readonly recommendedAction?: VisualRebaseRecommendedAction;
    readonly onStart: (plan: readonly VisualRebasePlanEntry[]) => void;
    readonly onContinue: () => void;
    readonly onAbort: () => void;
    readonly onSkip: () => void;
    readonly onOpenMergeEditor: (filePath: string) => void;
    readonly onMarkResolved: (filePath: string) => void;
    readonly onAcceptYours: (filePath: string) => void;
    readonly onAcceptIncoming: (filePath: string) => void;
    readonly onCancel: () => void;
}

const ACTIONS: readonly VisualRebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop', 'break', 'merge'];
const COMMIT_ACTIONS: readonly VisualRebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop', 'break'];

export function VisualRebaseApp({
    title,
    currentBranch,
    upstream,
    onto,
    initialCommits,
    safety,
    running,
    completedBackupRef,
    error,
    conflictFiles,
    rebaseInProgress,
    recommendedAction,
    onStart,
    onContinue,
    onAbort,
    onSkip,
    onOpenMergeEditor,
    onMarkResolved,
    onAcceptYours,
    onAcceptIncoming,
    onCancel,
}: VisualRebaseAppProps) {
    const [commits, setCommits] = useState(initialCommits);
    const [selectedHash, setSelectedHash] = useState(initialCommits[0]?.hash);
    const [confirming, setConfirming] = useState(false);

    const selected = commits.find((commit) => commit.hash === selectedHash) ?? commits[0];
    const plan = useMemo(() => commits.map(toPlanEntry), [commits]);
    const mergeAware = commits.some((commit) => commit.isMerge);
    const resumedRebase = rebaseInProgress && commits.length === 0;
    const rebaseFlowStarted = rebaseInProgress || completedBackupRef !== undefined;
    const hasConflicts = conflictFiles.length > 0;
    const skipPrimary = rebaseInProgress && recommendedAction === 'skip';
    const continueDisabled = running || hasConflicts || skipPrimary;
    const executableProblem = firstExecutableProblem(plan);
    const startBlockReason = safety?.workingTreeClean === false
        ? 'Commit or stash working tree changes before starting Visual Rebase.'
        : executableProblem;

    const updateAction = (hash: string, action: VisualRebaseAction) => {
        setCommits((current) => current.map((commit) => commit.hash === hash ? { ...commit, action } : commit));
        setConfirming(false);
    };

    const updateMessage = (hash: string, message: string) => {
        setCommits((current) => current.map((commit) => commit.hash === hash ? { ...commit, message } : commit));
        setConfirming(false);
    };

    const moveCommit = (hash: string, direction: -1 | 1) => {
        setCommits((current) => {
            const index = current.findIndex((commit) => commit.hash === hash);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= current.length) { return current; }
            const next = [...current];
            const [commit] = next.splice(index, 1);
            if (!commit) { return current; }
            next.splice(target, 0, commit);
            setConfirming(false);
            return next;
        });
    };

    return (
        <main className="visual-rebase">
            <header className="visual-rebase-header">
                <div>
                    <h1>{title}</h1>
                    <p>{resumedRebase ? 'Rebase already in progress for' : `${commits.length} commits from`} <strong>{currentBranch}</strong>{resumedRebase ? '.' : <> will replay onto <strong>{onto}</strong>.</>}</p>
                </div>
                <button type="button" className="visual-rebase-icon-button" title={completedBackupRef ? 'Close' : 'Cancel'} aria-label={completedBackupRef ? 'Close' : 'Cancel'} disabled={running || rebaseInProgress} onClick={onCancel}>
                    <Codicon name="close" />
                </button>
            </header>

            <section className="visual-rebase-layout">
                <aside className="visual-rebase-panel">
                    <h2>Setup</h2>
                    <dl className="visual-rebase-facts">
                        <dt>Current branch</dt>
                        <dd>{currentBranch}</dd>
                        <dt>Rebase onto</dt>
                        <dd>{onto}</dd>
                        <dt>Range</dt>
                        <dd>{upstream}..{currentBranch}</dd>
                    </dl>
                    <h2>Safety</h2>
                    {safety ? (
                        <ul className="visual-rebase-safety">
                            <li data-state={safety.workingTreeClean ? 'ok' : 'warn'}>Working tree {safety.workingTreeClean ? 'clean' : 'has changes'}</li>
                            <li data-state={safety.hasUpstream ? 'ok' : 'warn'}>{safety.hasUpstream ? 'Upstream configured' : 'No upstream configured'}</li>
                            <li data-state={safety.pushedCommits > 0 ? 'warn' : 'ok'}>{safety.pushedCommits} pushed commits detected</li>
                            <li data-state={safety.backupRef ? 'ok' : 'warn'}>{safety.backupRef ? 'Backup ref prepared' : 'No panel backup for existing rebase'}</li>
                        </ul>
                    ) : null}
                </aside>

                <section className="visual-rebase-plan" aria-label="Rebase plan">
                    <div className="visual-rebase-plan-heading">
                        <h2>{resumedRebase ? 'Rebase In Progress' : 'Plan'}</h2>
                        <span>{resumedRebase ? 'The original planner was closed. Runtime state was restored from extension storage.' : startBlockReason ?? (mergeAware ? 'Merge-aware mode preserves merge topology. Commit reordering is disabled.' : 'Pick, reword, edit, squash, fixup, drop, and break plans can run now.')}</span>
                    </div>
                    {resumedRebase ? (
                        <div className="visual-rebase-resume">
                            <Codicon name="git-merge" />
                            <strong>Paused rebase</strong>
                            <span>{conflictFiles.length > 0 ? 'Resolve conflicts, then continue.' : 'Continue, skip, or abort from the action bar.'}</span>
                        </div>
                    ) : <div className="visual-rebase-rows">
                        {commits.map((commit, index) => (
                            <article
                                key={commit.hash}
                                className={commit.hash === selected?.hash ? 'visual-rebase-row visual-rebase-row-selected' : 'visual-rebase-row'}
                                onClick={() => setSelectedHash(commit.hash)}
                            >
                                <div className="visual-rebase-lane" aria-hidden="true">
                                    <span />
                                </div>
                                <code>{commit.shortHash}</code>
                                <div className="visual-rebase-row-main">
                                    <strong>{commit.message}</strong>
                                    <span>{commit.authorName} · {relativeDate(commit.authorDate)}</span>
                                </div>
                                <Dropdown
                                    className={`visual-rebase-action visual-rebase-action-${commit.action}`}
                                    value={commit.action}
                                    ariaLabel={`Action for ${commit.shortHash}`}
                                    options={actionOptions(index, commit.isMerge)}
                                    disabled={running}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(action) => updateAction(commit.hash, action)}
                                />
                                <div className="visual-rebase-row-buttons">
                                    <button type="button" title="Move up" disabled={running || mergeAware || index === 0} onClick={(event) => { event.stopPropagation(); moveCommit(commit.hash, -1); }}>
                                        <Codicon name="fold-up" />
                                    </button>
                                    <button type="button" title="Move down" disabled={running || mergeAware || index === commits.length - 1} onClick={(event) => { event.stopPropagation(); moveCommit(commit.hash, 1); }}>
                                        <Codicon name="fold-down" />
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>}
                </section>

                <aside className="visual-rebase-panel">
                    <h2>Inspector</h2>
                    {selected ? (
                        <>
                            <dl className="visual-rebase-facts">
                                <dt>Commit</dt>
                                <dd>{selected.shortHash}</dd>
                                <dt>Action</dt>
                                <dd>{selected.action}</dd>
                                <dt>Message</dt>
                                <dd>{selected.message}</dd>
                            </dl>
                            <p className="visual-rebase-note">{selected.isMerge ? 'Merge commits preserve topology. Reword edits the merge message; break pauses after the merge.' : 'Edit and break pause the rebase at that point. Use Continue, Skip, or Abort after resolving the stop.'}</p>
                            <label className="visual-rebase-message-editor">
                                <span>Reword message</span>
                                <textarea
                                    value={selected.message}
                                    disabled={running || selected.action !== 'reword'}
                                    onChange={(event) => updateMessage(selected.hash, event.target.value)}
                                />
                            </label>
                        </>
                    ) : (
                        <p className="visual-rebase-note">{resumedRebase ? 'The active rebase was restored without the original editable plan.' : 'No commits in this range.'}</p>
                    )}
                </aside>
            </section>

            <footer className="visual-rebase-footer">
                <code>{resumedRebase ? 'rebase in progress' : todoPreview(plan)}</code>
                <div className="visual-rebase-footer-actions">
                    {rebaseInProgress ? (
                        <>
                            <button type="button" className={recommendedAction === 'continue' ? 'visual-rebase-primary' : 'visual-rebase-button'} disabled={continueDisabled} title={hasConflicts ? 'Resolve all conflicts before continuing' : undefined} onClick={onContinue}>Continue</button>
                            <button type="button" className={skipPrimary ? 'visual-rebase-primary' : 'visual-rebase-button'} disabled={running} onClick={onSkip}>Skip</button>
                            <button type="button" className="visual-rebase-button" disabled={running} onClick={onAbort}>Abort</button>
                        </>
                    ) : completedBackupRef ? (
                        <button type="button" className="visual-rebase-button" disabled={running} onClick={onCancel}>Close</button>
                    ) : (
                        <>
                            <button type="button" className="visual-rebase-button" disabled={running || rebaseFlowStarted} onClick={onCancel}>Cancel</button>
                            <button type="button" className="visual-rebase-primary" disabled={running || rebaseFlowStarted || commits.length === 0 || startBlockReason !== undefined} onClick={() => setConfirming(true)}>
                                {running ? 'Starting...' : 'Start Rebase'}
                            </button>
                        </>
                    )}
                </div>
            </footer>
            {confirming ? (
                <section className="visual-rebase-confirm" aria-label="Confirm visual rebase">
                    <div>
                        <strong>Start interactive rebase?</strong>
                        <span>{planSummary(plan)} Backup: {safety?.backupRef || 'pending'}.</span>
                    </div>
                    <button type="button" className="visual-rebase-button" disabled={running || rebaseFlowStarted} onClick={() => setConfirming(false)}>Review</button>
                    <button type="button" className="visual-rebase-primary" disabled={running || rebaseFlowStarted} onClick={() => { setConfirming(false); onStart(plan); }}>Confirm Start</button>
                </section>
            ) : null}
            {error ? <div className="visual-rebase-error" role="alert">{error}</div> : null}
            {rebaseInProgress && hasConflicts ? (
                <VisualRebaseConflictList
                    conflictFiles={conflictFiles}
                    running={running}
                    onOpenMergeEditor={onOpenMergeEditor}
                    onMarkResolved={onMarkResolved}
                    onAcceptCurrent={onAcceptYours}
                    onAcceptIncoming={onAcceptIncoming}
                />
            ) : null}
            {completedBackupRef ? <div className="visual-rebase-success" role="status">Rebase completed. Backup: {completedBackupRef}</div> : null}
        </main>
    );
}

function actionOptions(index: number, isMerge: boolean): readonly DropdownOption<VisualRebaseAction>[] {
    if (isMerge) {
        return [
            { value: 'merge', label: 'merge' },
            { value: 'reword', label: 'reword' },
            { value: 'break', label: 'break' },
        ];
    }
    return COMMIT_ACTIONS.map((action) => ({
        value: action,
        label: action,
        disabled: (action === 'squash' || action === 'fixup') && index === 0,
    }));
}

function toPlanEntry(commit: VisualRebaseCommit): VisualRebasePlanEntry {
    return {
        hash: commit.hash,
        action: commit.action,
        message: commit.message,
    };
}

function firstExecutableProblem(plan: readonly VisualRebasePlanEntry[]): string | undefined {
    if (plan.length === 0) { return undefined; }
    if (plan.every((entry) => entry.action === 'drop')) { return 'Cannot drop every commit.'; }
    if (plan[0]?.action === 'squash' || plan[0]?.action === 'fixup') { return `${plan[0].action} cannot be first.`; }
    return undefined;
}

function planSummary(plan: readonly VisualRebasePlanEntry[]): string {
    const counts = new Map<VisualRebaseAction, number>();
    for (const entry of plan) {
        counts.set(entry.action, (counts.get(entry.action) ?? 0) + 1);
    }
    return ACTIONS
        .map((action) => {
            const count = counts.get(action) ?? 0;
            return count > 0 ? `${count} ${action}` : undefined;
        })
        .filter((value): value is string => value !== undefined)
        .join(', ');
}

function todoPreview(plan: readonly VisualRebasePlanEntry[]): string {
    return plan.slice(0, 4).map((entry) => `${entry.action} ${entry.hash.substring(0, 7)} ${entry.message}`).join('   ');
}

function relativeDate(value: string): string {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) { return value; }
    const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
    if (days === 0) { return 'today'; }
    if (days === 1) { return 'yesterday'; }
    return `${days} days ago`;
}
