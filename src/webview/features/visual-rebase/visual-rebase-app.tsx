import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import type { CommitFileChange } from '@protocol/shared/commit';
import type { VisualRebaseOperation } from '@protocol/visual-rebase/messages';
import type { VisualRebaseAction, VisualRebaseCommit, VisualRebaseCommitDetails, VisualRebaseConflictFile, VisualRebasePlanEntry, VisualRebaseRef, VisualRebaseSafety } from '@protocol/visual-rebase/types';
import { Codicon } from '@webview/shared/codicon';
import { Dropdown, type DropdownOption } from '@webview/shared/dropdown';
import { Modal } from '@webview/shared/modal';
import { VisualRebaseCommitInspector } from '@webview/features/visual-rebase/visual-rebase-commit-inspector';
import { VisualRebaseConflictList } from '@webview/features/visual-rebase/visual-rebase-conflict-list';
import { VisualRebaseNotice } from '@webview/features/visual-rebase/visual-rebase-notice';
import { VisualRebaseOperationState } from '@webview/features/visual-rebase/visual-rebase-operation-state';
import { reorderVisualRebaseCommits, type VisualRebaseDropEdge } from '@webview/features/visual-rebase/visual-rebase-plan-model';
import { VisualRebaseRiskConfirmation } from '@webview/features/visual-rebase/visual-rebase-risk-confirmation';
import type { VisualRebaseNotice as VisualRebaseNoticeModel, VisualRebasePhase } from '@webview/features/visual-rebase/visual-rebase-state';

interface VisualRebaseAppProps {
    readonly title: string;
    readonly currentBranch: string;
    readonly upstream: string;
    readonly onto: string;
    readonly initialCommits: readonly VisualRebaseCommit[];
    readonly safety: VisualRebaseSafety | undefined;
    readonly refs?: readonly VisualRebaseRef[];
    readonly previewRunning?: boolean;
    readonly previewError?: string;
    readonly phase: VisualRebasePhase;
    readonly running: boolean;
    readonly operation?: VisualRebaseOperation;
    readonly completedBackupRef: string | undefined;
    readonly notice?: VisualRebaseNoticeModel;
    readonly conflictFiles: readonly VisualRebaseConflictFile[];
    readonly commitDetails?: VisualRebaseCommitDetails;
    readonly commitDetailsLoading?: boolean;
    readonly commitDetailsError?: string;
    readonly onStart: (rewriteAfter: string, replayOnto: string, plan: readonly VisualRebasePlanEntry[]) => void;
    readonly onPreview?: (rewriteAfter: string, replayOnto: string) => void;
    readonly onContinue: () => void;
    readonly onAbort: () => void;
    readonly onSkip: () => void;
    readonly onOpenMergeEditor: (filePath: string) => void;
    readonly onOpenFile?: (filePath: string) => void;
    readonly onSelectCommit?: (hash: string) => void;
    readonly onOpenCommitDiff?: (hash: string, file: CommitFileChange) => void;
    readonly onMarkResolved: (filePath: string) => void;
    readonly onAcceptYours: (filePath: string) => void;
    readonly onAcceptIncoming: (filePath: string) => void;
    readonly onCancel: () => void;
    readonly onReviewPlan: () => void;
}

const ACTIONS: readonly VisualRebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop', 'break', 'merge'];
const COMMIT_ACTIONS: readonly VisualRebaseAction[] = ['pick', 'reword', 'edit', 'squash', 'fixup', 'drop', 'break'];

interface VisualRebaseDropTarget {
    readonly hash: string;
    readonly edge: VisualRebaseDropEdge;
}

export function VisualRebaseApp({
    title,
    currentBranch,
    upstream,
    onto,
    initialCommits,
    safety,
    refs = [],
    previewRunning = false,
    previewError,
    phase,
    running,
    operation,
    completedBackupRef,
    notice,
    conflictFiles,
    commitDetails,
    commitDetailsLoading = false,
    commitDetailsError,
    onStart,
    onPreview = noopPreview,
    onContinue,
    onAbort,
    onSkip,
    onOpenMergeEditor,
    onOpenFile,
    onSelectCommit = noopSelectCommit,
    onOpenCommitDiff = noopOpenCommitDiff,
    onMarkResolved,
    onAcceptYours,
    onAcceptIncoming,
    onCancel,
    onReviewPlan,
}: VisualRebaseAppProps) {
    const [commits, setCommits] = useState(initialCommits);
    const [selectedHash, setSelectedHash] = useState(initialCommits[0]?.hash);
    const [confirming, setConfirming] = useState(false);
    const [rewriteAfter, setRewriteAfter] = useState(upstream);
    const [replayOnto, setReplayOnto] = useState(onto);
    const [pickerTarget, setPickerTarget] = useState<'rewriteAfter' | 'replayOnto' | undefined>(undefined);
    const [refSearch, setRefSearch] = useState('');
    const [draggedHash, setDraggedHash] = useState<string | undefined>(undefined);
    const [dropTarget, setDropTarget] = useState<VisualRebaseDropTarget | undefined>(undefined);
    const editedSetup = useRef(false);
    const requestedCommitHash = useRef<string | undefined>(undefined);

    const selected = commits.find((commit) => commit.hash === selectedHash) ?? commits[0];
    const selectedCommitHash = selected?.hash;
    const plan = useMemo(() => commits.map(toPlanEntry), [commits]);
    const mergeAware = commits.some((commit) => commit.isMerge);
    const canReorder = phase === 'planning' && !running && !mergeAware;
    const completed = phase === 'completed';
    const rebaseFlowStarted = phase !== 'planning';
    const hasConflicts = conflictFiles.length > 0;
    const conflictPause = phase === 'conflicts';
    const skipPrimary = phase === 'paused' && notice?.recommendedAction === 'skip';
    const continueDisabled = running || hasConflicts || skipPrimary;
    const executableProblem = firstExecutableProblem(plan);
    const planStatus = previewRunning
        ? 'Preview is updating.'
        : executableProblem;
    const startBlockReason = previewError ?? planStatus;
    const startDisabledReason = running
        ? 'Visual Rebase is starting.'
        : phase !== 'planning'
            ? 'The rebase plan is not editable in the current state.'
            : commits.length === 0
                ? 'No commits are available in this range. Adjust Rewrite commits after or Replay onto, then preview again.'
                : startBlockReason;

    useEffect(() => {
        if (!editedSetup.current || phase !== 'planning') { return; }
        const timer = window.setTimeout(() => {
            onPreview(rewriteAfter.trim(), replayOnto.trim());
        }, 350);
        return () => window.clearTimeout(timer);
    }, [onPreview, phase, replayOnto, rewriteAfter]);

    useEffect(() => {
        if (phase !== 'planning' || !selectedCommitHash || requestedCommitHash.current === selectedCommitHash) { return; }
        requestedCommitHash.current = selectedCommitHash;
        onSelectCommit(selectedCommitHash);
    }, [onSelectCommit, phase, selectedCommitHash]);

    const selectCommit = (hash: string) => {
        requestedCommitHash.current = hash;
        setSelectedHash(hash);
        onSelectCommit(hash);
    };

    const updateAction = (hash: string, action: VisualRebaseAction) => {
        setCommits((current) => current.map((commit) => commit.hash === hash ? { ...commit, action } : commit));
        setConfirming(false);
    };

    const updateMessage = (hash: string, message: string) => {
        setCommits((current) => current.map((commit) => commit.hash === hash ? { ...commit, message } : commit));
        setConfirming(false);
    };

    const finishDragging = () => {
        setDraggedHash(undefined);
        setDropTarget(undefined);
    };

    const moveCommit = (hash: string, direction: -1 | 1) => {
        setCommits((current) => {
            const index = current.findIndex((commit) => commit.hash === hash);
            const target = current[index + direction];
            if (!target) { return current; }
            return reorderVisualRebaseCommits(current, hash, target.hash, direction < 0 ? 'before' : 'after');
        });
        setConfirming(false);
    };

    const startDragging = (event: DragEvent<HTMLSpanElement>, hash: string) => {
        if (!canReorder) {
            event.preventDefault();
            return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', hash);
        const row = event.currentTarget.parentElement;
        if (row) { event.dataTransfer.setDragImage(row, 16, 16); }
        selectCommit(hash);
        setDraggedHash(hash);
        setDropTarget(undefined);
    };

    const updateDropTarget = (event: DragEvent<HTMLElement>, targetHash: string) => {
        if (!canReorder || !draggedHash) { return; }
        if (draggedHash === targetHash) {
            setDropTarget(undefined);
            return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const edge = dropEdge(event.currentTarget, event.clientY);
        setDropTarget((current) => current?.hash === targetHash && current.edge === edge
            ? current
            : { hash: targetHash, edge });
    };

    const dropCommit = (event: DragEvent<HTMLElement>, targetHash: string) => {
        if (!canReorder) { return; }
        const sourceHash = draggedHash ?? event.dataTransfer.getData('text/plain');
        if (!sourceHash || sourceHash === targetHash) {
            finishDragging();
            return;
        }
        event.preventDefault();
        const edge = dropTarget?.hash === targetHash
            ? dropTarget.edge
            : dropEdge(event.currentTarget, event.clientY);
        setCommits((current) => reorderVisualRebaseCommits(current, sourceHash, targetHash, edge));
        setConfirming(false);
        finishDragging();
    };

    const resetPlan = () => {
        setCommits(initialCommits);
        setSelectedHash(initialCommits[0]?.hash);
        setConfirming(false);
        finishDragging();
    };

    const startRebase = () => {
        if (safety && requiresRiskConfirmation(safety)) {
            setConfirming(true);
            return;
        }
        onStart(rewriteAfter.trim(), replayOnto.trim(), plan);
    };

    const confirmStart = () => {
        setConfirming(false);
        onStart(rewriteAfter.trim(), replayOnto.trim(), plan);
    };

    return (
        <main className="visual-rebase">
            <header className="visual-rebase-header">
                <div>
                    <h1>{title}</h1>
                    <p>{phaseSubtitle(phase, commits.length, currentBranch, replayOnto)}</p>
                </div>
                <button
                    type="button"
                    className="visual-rebase-icon-button visual-rebase-close"
                    title={completed ? 'Close' : 'Cancel'}
                    aria-label={completed ? 'Close' : 'Cancel'}
                    disabled={running || phase === 'paused' || phase === 'conflicts'}
                    onClick={onCancel}
                >
                    <Codicon name="close" />
                </button>
            </header>

            {completed ? (
                <section className="visual-rebase-completed" aria-label="Visual rebase completed">
                    <Codicon name="check" />
                    <h2>Rebase Completed</h2>
                    <p>{currentBranch} was rewritten onto {replayOnto}.</p>
                    <dl className="visual-rebase-completed-facts">
                        <dt>Branch</dt>
                        <dd>{currentBranch}</dd>
                        <dt>Backup ref</dt>
                        <dd>{completedBackupRef}</dd>
                    </dl>
                </section>
            ) : (
                <section className={conflictPause ? 'visual-rebase-layout visual-rebase-layout-conflicts' : 'visual-rebase-layout'}>
                    {!conflictPause ? <aside className="visual-rebase-panel">
                        <div className="visual-rebase-panel-heading">
                            <h2>Setup</h2>
                            {previewRunning ? <span><Codicon name="loading" spin /> Updating</span> : null}
                        </div>
                        <div className="visual-rebase-setup">
                            <label>
                                <span>Target branch</span>
                                <input value={currentBranch} disabled />
                            </label>
                            <RefInput
                                label="Rewrite commits after"
                                value={rewriteAfter}
                                tooltip="Chooses the base ref excluded from the plan. Commits in this ref are kept as-is."
                                disabled={phase !== 'planning'}
                                onChange={(value) => {
                                    editedSetup.current = true;
                                    setRewriteAfter(value);
                                }}
                                onPick={() => {
                                    setRefSearch('');
                                    setPickerTarget('rewriteAfter');
                                }}
                            />
                            <RefInput
                                label="Replay onto"
                                value={replayOnto}
                                tooltip="Chooses the new base where selected commits will be replayed."
                                disabled={phase !== 'planning'}
                                onChange={(value) => {
                                    editedSetup.current = true;
                                    setReplayOnto(value);
                                }}
                                onPick={() => {
                                    setRefSearch('');
                                    setPickerTarget('replayOnto');
                                }}
                            />
                        </div>
                        {pickerTarget ? (
                            <RefPicker
                                target={pickerTarget}
                                refs={refs}
                                search={refSearch}
                                onSearch={setRefSearch}
                                onClose={() => setPickerTarget(undefined)}
                                onSelect={(value) => {
                                    editedSetup.current = true;
                                    if (pickerTarget === 'rewriteAfter') {
                                        setRewriteAfter(value);
                                    } else {
                                        setReplayOnto(value);
                                    }
                                    setPickerTarget(undefined);
                                }}
                            />
                        ) : null}
                        <h2>Safety</h2>
                        {safety ? (
                            <ul className="visual-rebase-safety">
                                <li data-state={safety.workingTreeClean ? 'ok' : 'warn'}><span>Working tree {safety.workingTreeClean ? 'clean' : 'has changes'}</span></li>
                                <li data-state={safety.hasUpstream ? 'ok' : 'warn'}><span>{safety.hasUpstream ? 'Upstream configured' : 'No upstream configured'}</span></li>
                                <li data-state={safety.pushedCommits > 0 ? 'warn' : 'ok'}><span>{safety.pushedCommits} published commits</span></li>
                                <li data-state={safety.backupRef ? 'ok' : 'warn'}><span>{safety.backupRef ? 'Backup ref planned' : 'Backup ref unavailable'}</span></li>
                            </ul>
                        ) : null}
                    </aside> : null}

                    <section className="visual-rebase-plan" aria-label={phaseLabel(phase)}>
                        {phase === 'planning' ? (
                            <>
                                <div className="visual-rebase-plan-heading">
                                    <div>
                                        <h2>Plan</h2>
                                        <span>{planStatus ?? (mergeAware ? 'Merge topology is preserved; reordering is disabled.' : planSummary(plan))}</span>
                                    </div>
                                    <button type="button" className="visual-rebase-icon-button" title="Reset plan" aria-label="Reset plan" disabled={running} onClick={resetPlan}>
                                        <Codicon name="discard" />
                                    </button>
                                </div>
                                <div className="visual-rebase-rows">
                                    {commits.map((commit, index) => (
                                        <article
                                            key={commit.hash}
                                            className={rowClassName(commit.hash, selected?.hash, draggedHash, dropTarget)}
                                            onClick={() => selectCommit(commit.hash)}
                                            onDragOver={(event) => updateDropTarget(event, commit.hash)}
                                            onDrop={(event) => dropCommit(event, commit.hash)}
                                        >
                                            <span
                                                className="visual-rebase-drag-handle"
                                                draggable={canReorder}
                                                title={canReorder
                                                    ? 'Drag to reorder commit'
                                                    : mergeAware
                                                        ? 'Reordering is disabled for merge-aware plans'
                                                        : undefined}
                                                aria-label={canReorder ? `Reorder ${commit.shortHash}` : undefined}
                                                onDragStart={(event) => startDragging(event, commit.hash)}
                                                onDragEnd={finishDragging}
                                            >
                                                <Codicon name="grabber" />
                                            </span>
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
                                                disabled={running || rebaseFlowStarted}
                                                onClick={(event) => event.stopPropagation()}
                                                onChange={(action) => updateAction(commit.hash, action)}
                                            />
                                            <div className="visual-rebase-row-buttons">
                                                <button type="button" title="Move up" disabled={running || rebaseFlowStarted || mergeAware || index === 0} onClick={(event) => { event.stopPropagation(); moveCommit(commit.hash, -1); }}><Codicon name="fold-up" /></button>
                                                <button type="button" title="Move down" disabled={running || rebaseFlowStarted || mergeAware || index === commits.length - 1} onClick={(event) => { event.stopPropagation(); moveCommit(commit.hash, 1); }}><Codicon name="fold-down" /></button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        ) : conflictPause ? (
                            <>
                                <VisualRebaseNotice message={notice?.message ?? 'Rebase paused with conflicts.'} details={notice?.details} tone="warning" />
                                <VisualRebaseConflictList
                                    conflictFiles={conflictFiles}
                                    running={running}
                                    onOpenMergeEditor={onOpenMergeEditor}
                                    onOpenFile={onOpenFile ?? noop}
                                    onMarkResolved={onMarkResolved}
                                    onAcceptCurrent={onAcceptYours}
                                    onAcceptIncoming={onAcceptIncoming}
                                />
                            </>
                        ) : (
                            <VisualRebaseOperationState
                                state={phase === 'loading' ? 'loading' : phase === 'running' ? 'running' : phase === 'paused' ? 'paused' : phase === 'aborted' ? 'aborted' : 'failed'}
                                branch={currentBranch}
                                replayOnto={replayOnto}
                                operation={operation}
                                message={notice?.message}
                                details={notice?.details}
                            />
                        )}
                    </section>

                    {!conflictPause ? <aside className={phase === 'planning' ? 'visual-rebase-panel visual-rebase-inspector' : 'visual-rebase-panel'}>
                        <h2>{phase === 'planning' ? 'Inspector' : 'Operation'}</h2>
                        {phase === 'planning' && selected ? (
                            <VisualRebaseCommitInspector
                                commit={selected}
                                details={commitDetails}
                                loading={commitDetailsLoading}
                                error={commitDetailsError}
                                onMessageChange={(message) => updateMessage(selected.hash, message)}
                                onOpenDiff={(file) => onOpenCommitDiff(selected.hash, file)}
                            />
                        ) : phase === 'planning' ? (
                            <p className="visual-rebase-note">No commits in this range.</p>
                        ) : (
                            <dl className="visual-rebase-facts visual-rebase-operation-facts">
                                <dt>Branch</dt>
                                <dd>{currentBranch}</dd>
                                <dt>Rewrite after</dt>
                                <dd>{rewriteAfter}</dd>
                                <dt>Replay onto</dt>
                                <dd>{replayOnto}</dd>
                                <dt>Backup ref</dt>
                                <dd>{safety?.backupRef || 'Unavailable'}</dd>
                            </dl>
                        )}
                    </aside> : null}
                </section>
            )}

            <footer className="visual-rebase-footer">
                <span className="visual-rebase-footer-summary">{footerSummary(phase, commits.length, currentBranch, replayOnto, plan, operation)}</span>
                <div className="visual-rebase-footer-actions">
                    {phase === 'paused' || phase === 'conflicts' ? (
                        <>
                            <button type="button" className={notice?.recommendedAction === 'continue' ? 'visual-rebase-primary' : 'visual-rebase-button'} disabled={continueDisabled} title={hasConflicts ? 'Resolve all conflicts before continuing' : undefined} onClick={onContinue}>Continue</button>
                            <button type="button" className={skipPrimary ? 'visual-rebase-primary' : 'visual-rebase-button'} disabled={running} onClick={onSkip}>Skip</button>
                            <button type="button" className="visual-rebase-button" disabled={running} onClick={onAbort}>Abort</button>
                        </>
                    ) : completed ? (
                        <button type="button" className="visual-rebase-button" onClick={onCancel}>Close</button>
                    ) : phase === 'failed' || phase === 'aborted' ? (
                        <>
                            {commits.length > 0 ? <button type="button" className="visual-rebase-button" onClick={onReviewPlan}>Review Plan</button> : null}
                            <button type="button" className="visual-rebase-primary" onClick={onCancel}>Close</button>
                        </>
                    ) : phase === 'planning' ? (
                        <>
                            <button type="button" className="visual-rebase-button" onClick={onCancel}>Cancel</button>
                            <button type="button" className="visual-rebase-primary" disabled={startDisabledReason !== undefined} title={startDisabledReason} onClick={startRebase}>Start Rebase</button>
                        </>
                    ) : null}
                </div>
                {startDisabledReason && phase === 'planning' ? (
                    <div className="visual-rebase-start-blocked" role="status"><Codicon name="warning" /><span>{startDisabledReason}</span></div>
                ) : null}
            </footer>
            {confirming && safety ? (
                <VisualRebaseRiskConfirmation
                    isOpen
                    currentBranch={currentBranch}
                    rewriteAfter={rewriteAfter}
                    replayOnto={replayOnto}
                    commitCount={commits.length}
                    safety={safety}
                    onConfirm={confirmStart}
                    onClose={() => setConfirming(false)}
                />
            ) : null}
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

function rowClassName(
    hash: string,
    selectedHash: string | undefined,
    draggedHash: string | undefined,
    dropTarget: VisualRebaseDropTarget | undefined,
): string {
    return [
        'visual-rebase-row',
        hash === selectedHash ? 'visual-rebase-row-selected' : undefined,
        hash === draggedHash ? 'visual-rebase-row-dragging' : undefined,
        hash === dropTarget?.hash ? `visual-rebase-row-drop-${dropTarget.edge}` : undefined,
    ].filter((value): value is string => value !== undefined).join(' ');
}

function dropEdge(target: HTMLElement, clientY: number): VisualRebaseDropEdge {
    const bounds = target.getBoundingClientRect();
    return clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
}

interface RefInputProps {
    readonly label: string;
    readonly value: string;
    readonly tooltip: string;
    readonly disabled: boolean;
    readonly onChange: (value: string) => void;
    readonly onPick: () => void;
}

function RefInput({ label, value, tooltip, disabled, onChange, onPick }: RefInputProps) {
    return (
        <label className="visual-rebase-ref-input">
            <span>
                {label}
                <button type="button" className="visual-rebase-help" title={tooltip} aria-label={`${label}: ${tooltip}`}>
                    <Codicon name="comment-discussion" />
                </button>
            </span>
            <span className="visual-rebase-ref-control">
                <input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
                <button type="button" className="visual-rebase-icon-button" title={`Pick ${label}`} disabled={disabled} onClick={onPick}>
                    <Codicon name="search" />
                </button>
            </span>
        </label>
    );
}

interface RefPickerProps {
    readonly target: 'rewriteAfter' | 'replayOnto';
    readonly refs: readonly VisualRebaseRef[];
    readonly search: string;
    readonly onSearch: (value: string) => void;
    readonly onSelect: (value: string) => void;
    readonly onClose: () => void;
}

function RefPicker({ target, refs, search, onSearch, onSelect, onClose }: RefPickerProps) {
    const title = target === 'rewriteAfter' ? 'Pick Rewrite commits after' : 'Pick Replay onto';
    const filtered = refs
        .filter((ref) => ref.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 30);
    return (
        <Modal isOpen title={title} className="visual-rebase-ref-picker-modal" onClose={onClose}>
            <section className="visual-rebase-ref-picker" aria-label={title}>
                <input autoFocus value={search} placeholder="Search branches, tags, or commits" onChange={(event) => onSearch(event.target.value)} />
                <div className="visual-rebase-ref-results">
                    {filtered.map((ref) => (
                        <button key={`${ref.kind}:${ref.name}`} type="button" onClick={() => onSelect(ref.name)}>
                            <Codicon name={iconForRef(ref)} />
                            <span>
                                <strong>{ref.name}</strong>
                                <small>{labelForRef(ref)}</small>
                            </span>
                        </button>
                    ))}
                    {filtered.length === 0 ? <span className="visual-rebase-ref-empty">No matching refs</span> : null}
                </div>
            </section>
        </Modal>
    );
}

function iconForRef(ref: VisualRebaseRef) {
    if (ref.kind === 'tag') { return 'git-compare'; }
    return ref.kind === 'remoteBranch' ? 'git-merge' : 'source-control';
}

function labelForRef(ref: VisualRebaseRef): string {
    if (ref.isCurrent) { return 'current branch'; }
    if (ref.upstream) { return `tracks ${ref.upstream}`; }
    if (ref.kind === 'remoteBranch') { return 'remote branch'; }
    if (ref.kind === 'tag') { return 'tag'; }
    return 'local branch';
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

function requiresRiskConfirmation(safety: VisualRebaseSafety): boolean {
    return !safety.workingTreeClean || safety.pushedCommits > 0;
}

function phaseSubtitle(phase: VisualRebasePhase, commitCount: number, branch: string, replayOnto: string) {
    if (phase === 'loading') { return <>Loading repository state.</>; }
    if (phase === 'completed') { return <>Rebase completed for <strong>{branch}</strong>.</>; }
    if (phase === 'conflicts') { return <>Resolve conflicts on <strong>{branch}</strong>.</>; }
    if (phase === 'paused') { return <>Rebase paused on <strong>{branch}</strong>.</>; }
    if (phase === 'running') { return <>Rewriting <strong>{branch}</strong> onto <strong>{replayOnto}</strong>.</>; }
    if (phase === 'aborted') { return <>Rebase aborted for <strong>{branch}</strong>.</>; }
    if (phase === 'failed') { return <>Rebase failed for <strong>{branch}</strong>.</>; }
    return <>{commitCount} commits from <strong>{branch}</strong> will replay onto <strong>{replayOnto}</strong>.</>;
}

function phaseLabel(phase: VisualRebasePhase): string {
    if (phase === 'conflicts') { return 'Rebase conflicts'; }
    if (phase === 'paused') { return 'Rebase paused'; }
    if (phase === 'running') { return 'Rebase running'; }
    if (phase === 'completed') { return 'Rebase completed'; }
    if (phase === 'aborted') { return 'Rebase aborted'; }
    if (phase === 'failed') { return 'Rebase failed'; }
    return 'Rebase plan';
}

function footerSummary(
    phase: VisualRebasePhase,
    commitCount: number,
    branch: string,
    replayOnto: string,
    plan: readonly VisualRebasePlanEntry[],
    operation: VisualRebaseOperation | undefined,
): string {
    if (phase === 'running') { return operationLabel(operation); }
    if (phase === 'paused') { return `Paused: ${branch} onto ${replayOnto}`; }
    if (phase === 'conflicts') { return `Conflicts: ${branch} onto ${replayOnto}`; }
    if (phase === 'completed') { return `Completed: ${branch} onto ${replayOnto}`; }
    if (phase === 'aborted') { return `Aborted: ${branch}`; }
    if (phase === 'failed') { return `Failed: ${branch}`; }
    if (phase === 'loading') { return 'Loading rebase state'; }
    return `${commitCount} commits · ${planSummary(plan)}`;
}

function operationLabel(operation: VisualRebaseOperation | undefined): string {
    if (operation === 'continue') { return 'Continuing rebase'; }
    if (operation === 'skip') { return 'Skipping commit'; }
    if (operation === 'abort') { return 'Aborting rebase'; }
    if (operation === 'resolveConflict') { return 'Updating conflicts'; }
    return 'Rebasing';
}

function relativeDate(value: string): string {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) { return value; }
    const days = Math.max(0, Math.floor((Date.now() - time) / 86400000));
    if (days === 0) { return 'today'; }
    if (days === 1) { return 'yesterday'; }
    return `${days} days ago`;
}

function noop(): void {}

function noopPreview(): void {}

function noopSelectCommit(): void {}

function noopOpenCommitDiff(): void {}
