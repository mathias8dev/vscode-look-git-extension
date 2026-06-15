// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisualRebaseApp } from '../../../src/webview/features/visual-rebase/VisualRebaseApp';

describe('VisualRebaseApp', () => {
    it('submits the edited action plan', () => {
        const onStart = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[
                    commit('aaa111111111', 'feat: first'),
                    commit('bbb222222222', 'fix: second'),
                ]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'fixup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Start' }));

        expect(onStart).toHaveBeenCalledWith([
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
            { hash: 'bbb222222222', action: 'fixup', message: 'fix: second' },
        ]);
    });

    it('allows editing the message for reword actions', () => {
        const onStart = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for aaa1111'), { target: { value: 'reword' } });
        fireEvent.change(screen.getByLabelText('Reword message'), { target: { value: 'feat: better message' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Start' }));

        expect(onStart).toHaveBeenCalledWith([
            { hash: 'aaa111111111', action: 'reword', message: 'feat: better message' },
        ]);
    });

    it('allows edit and break actions to start', () => {
        const onStart = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[
                    commit('aaa111111111', 'feat: first'),
                    commit('bbb222222222', 'fix: second'),
                ]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for aaa1111'), { target: { value: 'edit' } });
        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'break' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Start' }));

        expect(onStart).toHaveBeenCalledWith([
            { hash: 'aaa111111111', action: 'edit', message: 'feat: first' },
            { hash: 'bbb222222222', action: 'break', message: 'fix: second' },
        ]);
    });

    it('shows conflict file actions during a paused rebase', () => {
        const onOpenMergeEditor = vi.fn();
        const onMarkResolved = vi.fn();
        const onAcceptYours = vi.fn();
        const onAcceptIncoming = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error="Resolve conflicts."
                conflictFiles={['src/app.ts']}
                rebaseInProgress
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={onOpenMergeEditor}
                onMarkResolved={onMarkResolved}
                onAcceptYours={onAcceptYours}
                onAcceptIncoming={onAcceptIncoming}
                onCancel={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Accept Current' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept Incoming' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open Merge Editor' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark Resolved' }));

        expect(screen.getByText('1 conflict remaining')).toBeInTheDocument();
        expect(screen.getByText('Unresolved')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(onAcceptYours).toHaveBeenCalledWith('src/app.ts');
        expect(onAcceptIncoming).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenMergeEditor).toHaveBeenCalledWith('src/app.ts');
        expect(onMarkResolved).toHaveBeenCalledWith('src/app.ts');
    });

    it('promotes skip when the paused rebase has an empty commit', () => {
        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error="Accepted conflict side. No changes remain; skip this commit to continue the rebase."
                conflictFiles={[]}
                rebaseInProgress
                recommendedAction="skip"
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Skip' })).toHaveClass('visual-rebase-primary');
    });

    it('shows rebase actions once a rebase is in progress', () => {
        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error="Rebase paused."
                conflictFiles={[]}
                rebaseInProgress
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Start Rebase' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Abort' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('shows close after a completed rebase', () => {
        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef="refs/look-git/backup/feature-payments"
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Start Rebase' })).not.toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    });

    it('shows merge commits as preserved topology rows', () => {
        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[
                    commit('aaa111111111', 'feat: first'),
                    { ...commit('bbb222222222', 'merge branch'), action: 'merge', isMerge: true },
                ]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.getByLabelText('Action for bbb2222')).toHaveValue('merge');
        expect(screen.getByText('Merge-aware mode preserves merge topology. Commit reordering is disabled.')).toBeInTheDocument();
    });

    it('allows merge commits to be reworded', () => {
        const onStart = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[
                    commit('aaa111111111', 'feat: first'),
                    { ...commit('bbb222222222', 'merge branch'), action: 'merge', isMerge: true },
                ]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        fireEvent.click(screen.getByText('merge branch'));
        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'reword' } });
        fireEvent.change(screen.getByLabelText('Reword message'), { target: { value: 'merge: better message' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Start' }));

        expect(onStart).toHaveBeenCalledWith([
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
            { hash: 'bbb222222222', action: 'reword', message: 'merge: better message' },
        ]);
    });

    it('shows a resumed rebase view without an editable plan', () => {
        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                error="Interactive rebase already in progress."
                conflictFiles={[]}
                rebaseInProgress
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Rebase In Progress' })).toBeInTheDocument();
        expect(screen.getByText('The original planner was closed. Runtime state was restored from extension storage.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Rebase plan')).toBeInTheDocument();
        expect(screen.queryByText('No commits in this range.')).not.toBeInTheDocument();
    });
});

function commit(hash: string, message: string) {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message,
        authorName: 'Ada',
        authorDate: '2026-06-15T00:00:00Z',
        action: 'pick' as const,
        isMerge: false,
    };
}
