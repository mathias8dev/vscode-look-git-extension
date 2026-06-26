// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisualRebaseApp } from '@webview/features/visual-rebase/visual-rebase-app';

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

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
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

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
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

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
            { hash: 'aaa111111111', action: 'edit', message: 'feat: first' },
            { hash: 'bbb222222222', action: 'break', message: 'fix: second' },
        ]);
    });

    it('allows start when the working tree has changes because visual rebase uses autostash', () => {
        const onStart = vi.fn();

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[commit('aaa111111111', 'feat: first')]}
                safety={{
                    workingTreeClean: false,
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

        const startButton = screen.getByRole('button', { name: 'Start Rebase' });

        expect(startButton).toBeEnabled();
        expect(screen.getByText('Working tree has changes')).toBeInTheDocument();
        fireEvent.click(startButton);
        fireEvent.click(screen.getByRole('button', { name: 'Confirm Start' }));

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
        ]);
    });

    it('shows why start is disabled when the preview range has no commits', () => {
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

        const startButton = screen.getByRole('button', { name: 'Start Rebase' });
        const message = 'No commits are available in this range. Adjust Rewrite commits after or Replay onto, then preview again.';

        expect(startButton).toBeDisabled();
        expect(startButton).toHaveAttribute('title', message);
        expect(screen.getByRole('status')).toHaveTextContent(message);
    });

    it('automatically previews setup changes and picks refs inside the panel', async () => {
        const onPreview = vi.fn();

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
                refs={[
                    { name: 'main', kind: 'localBranch', hash: '111' },
                    { name: 'origin/main', kind: 'remoteBranch', hash: '222' },
                    { name: 'v1.0.0', kind: 'tag', hash: '333' },
                ]}
                running={false}
                completedBackupRef={undefined}
                error={undefined}
                conflictFiles={[]}
                rebaseInProgress={false}
                onStart={() => {}}
                onPreview={onPreview}
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

        const inputs = screen.getAllByRole('textbox');
        fireEvent.change(inputs[2]!, { target: { value: 'develop' } });

        await waitFor(() => expect(onPreview).toHaveBeenCalledWith('main', 'develop'));

        fireEvent.click(screen.getByRole('button', { name: 'Pick Rewrite commits after' }));
        expect(screen.getByRole('dialog', { name: 'Pick Rewrite commits after' })).toBeInTheDocument();
        expect(document.getElementById('look-git-portal-root')).not.toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /origin\/main/ }));

        await waitFor(() => expect(onPreview).toHaveBeenLastCalledWith('origin/main', 'develop'));
        expect(screen.queryByRole('dialog', { name: 'Pick Rewrite commits after' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    });

    it('shows conflict file actions during a paused rebase', () => {
        const onOpenMergeEditor = vi.fn();
        const onOpenFile = vi.fn();
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
                conflictFiles={[conflictFile('src/app.ts', 'unmerged')]}
                rebaseInProgress
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={onOpenMergeEditor}
                onOpenFile={onOpenFile}
                onMarkResolved={onMarkResolved}
                onAcceptYours={onAcceptYours}
                onAcceptIncoming={onAcceptIncoming}
                onCancel={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Accept current changes (ours)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept incoming changes (theirs)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open merge editor' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

        expect(screen.getByText('1 conflict remaining')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Unmerged Changes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(onAcceptYours).toHaveBeenCalledWith('src/app.ts');
        expect(onAcceptIncoming).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenMergeEditor).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenFile).toHaveBeenCalledWith('src/app.ts');
        expect(onMarkResolved).toHaveBeenCalledWith('src/app.ts');
    });

    it('shows merged files as ready to mark resolved', () => {
        const onOpenFile = vi.fn();
        const onMarkResolved = vi.fn();

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
                error="All conflict markers resolved."
                conflictFiles={[conflictFile('src/app.ts', 'merged')]}
                rebaseInProgress
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onOpenFile={onOpenFile}
                onMarkResolved={onMarkResolved}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
            />,
        );

        expect(screen.getByText('1 file ready to mark resolved')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Merged, Not Marked Resolved' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Open merge editor' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Accept current changes (ours)' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

        expect(onMarkResolved).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenFile).toHaveBeenCalledWith('src/app.ts');
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

    it('shows a completed state instead of the editable planner after a completed rebase', () => {
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
        expect(screen.getByRole('heading', { name: 'Rebase Completed' })).toBeInTheDocument();
        expect(screen.getByText('refs/look-git/backup/feature-payments')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Setup' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Plan' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Inspector' })).not.toBeInTheDocument();
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

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
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

function conflictFile(filePath: string, state: 'unmerged' | 'merged') {
    return {
        filePath,
        indexStatus: state === 'unmerged' ? 'U' : ' ',
        workTreeStatus: state === 'unmerged' ? 'U' : 'M',
        state,
    };
}
