// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VisualRebaseApp } from '@webview/features/visual-rebase/visual-rebase-app';

describe('VisualRebaseApp', () => {
    it('loads files for the selected commit and opens a file diff', async () => {
        const onSelectCommit = vi.fn();
        const onOpenCommitDiff = vi.fn();
        const first = commit('aaa111111111', 'feat: first');
        const changedFile = { status: 'M', filePath: 'src/app.ts' } as const;

        render(
            <VisualRebaseApp
                title="Visual Rebase onto main"
                currentBranch="feature/payments"
                upstream="main"
                onto="main"
                initialCommits={[first, commit('bbb222222222', 'fix: second')]}
                safety={undefined}
                running={false}
                completedBackupRef={undefined}
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                commitDetails={{ hash: first.hash, files: [changedFile] }}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onSelectCommit={onSelectCommit}
                onOpenCommitDiff={onOpenCommitDiff}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        await waitFor(() => expect(onSelectCommit).toHaveBeenCalledWith(first.hash));
        fireEvent.click(screen.getByTitle('src/app.ts'));
        expect(onOpenCommitDiff).toHaveBeenCalledWith(first.hash, changedFile);

        fireEvent.click(screen.getByText('fix: second'));
        await waitFor(() => expect(onSelectCommit).toHaveBeenCalledWith('bbb222222222'));
    });

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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'fixup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
        expect(screen.getByLabelText('Action for bbb2222')).toHaveValue('pick');
        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'fixup' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(onStart).toHaveBeenCalledWith('main', 'main', [
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
            { hash: 'bbb222222222', action: 'fixup', message: 'fix: second' },
        ]);
    });

    it('submits commits in the order chosen by drag and drop', () => {
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
                    commit('ccc333333333', 'test: third'),
                ]}
                safety={{
                    workingTreeClean: true,
                    hasUpstream: true,
                    pushedCommits: 0,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                running={false}
                completedBackupRef={undefined}
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        const source = screen.getByLabelText('Reorder aaa1111');
        const target = screen.getByText('test: third').closest('article');
        if (!target) { throw new Error('Expected the third commit row.'); }
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
            x: 0,
            y: 0,
            width: 400,
            height: 40,
            top: 0,
            right: 400,
            bottom: 40,
            left: 0,
            toJSON: () => ({}),
        });
        const dataTransfer = {
            effectAllowed: 'uninitialized',
            dropEffect: 'none',
            setData: vi.fn(),
            getData: vi.fn(() => 'aaa111111111'),
            setDragImage: vi.fn(),
        };

        fireEvent.dragStart(source, { dataTransfer });
        fireEvent.dragOver(target, { clientY: 30, dataTransfer });
        expect(target).toHaveClass('visual-rebase-row-drop-after');
        fireEvent.drop(target, { clientY: 30, dataTransfer });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
            { hash: 'bbb222222222', action: 'pick', message: 'fix: second' },
            { hash: 'ccc333333333', action: 'pick', message: 'test: third' },
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for aaa1111'), { target: { value: 'reword' } });
        fireEvent.change(screen.getByLabelText('Reword message'), { target: { value: 'feat: better message' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));

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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.change(screen.getByLabelText('Action for aaa1111'), { target: { value: 'edit' } });
        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'break' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));

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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        const startButton = screen.getByRole('button', { name: 'Start Rebase' });

        expect(startButton).toBeEnabled();
        expect(screen.getByText('Working tree has changes')).toBeInTheDocument();
        fireEvent.click(startButton);
        const dialog = screen.getByRole('dialog', { name: 'Start with Working Tree Changes?' });
        expect(within(dialog).getByText('Working tree changes will be autostashed and restored by Git.')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Start Rebase' }));

        expect(onStart).toHaveBeenCalledWith('main', 'main', [
            { hash: 'aaa111111111', action: 'pick', message: 'feat: first' },
        ]);
    });

    it('requires confirmation before rewriting published commits', () => {
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
                    pushedCommits: 1,
                    backupRef: 'refs/look-git/backup/feature-payments',
                }}
                phase="planning"
                running={false}
                completedBackupRef={undefined}
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));
        const dialog = screen.getByRole('dialog', { name: 'Rewrite Published Commits?' });
        expect(within(dialog).getByText('1 published commit will require a force-with-lease push.')).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Start Rebase' }));
        expect(onStart).toHaveBeenCalledOnce();
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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
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
                onReviewPlan={() => {}}
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
                phase="conflicts"
                notice={{ message: 'Resolve conflicts.', details: 'Command failed: git rebase --rebase-merges' }}
                conflictFiles={[conflictFile('src/app.ts', 'unmerged')]}
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
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Accept current changes (ours)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Accept incoming changes (theirs)' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open merge editor' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }));
        fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

        expect(screen.getByText('1 conflict remaining')).toBeInTheDocument();
        expect(screen.getByText('Resolve conflicts before continuing')).toBeInTheDocument();
        expect(screen.getAllByText('Resolve conflicts.')).toHaveLength(1);
        expect(screen.getByText('Show Git output')).toBeInTheDocument();
        expect(screen.getByLabelText('Rebase conflicts')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Unmerged Changes' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Setup' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Operation' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
        expect(onAcceptYours).toHaveBeenCalledWith('src/app.ts');
        expect(onAcceptIncoming).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenMergeEditor).toHaveBeenCalledWith('src/app.ts');
        expect(onOpenFile).toHaveBeenCalledWith('src/app.ts');
        expect(onMarkResolved).toHaveBeenCalledWith('src/app.ts');
    });

    it('renders a start failure only once', () => {
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
                phase="failed"
                notice={{ message: 'Command failed.' }}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        expect(screen.getAllByText('Command failed.')).toHaveLength(1);
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
                phase="conflicts"
                notice={{ message: 'All conflict markers resolved.' }}
                conflictFiles={[conflictFile('src/app.ts', 'merged')]}
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
                onReviewPlan={() => {}}
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
                phase="paused"
                notice={{
                    message: 'Accepted conflict side. No changes remain; skip this commit to continue the rebase.',
                    recommendedAction: 'skip',
                }}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
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
                phase="paused"
                notice={{ message: 'Rebase paused.' }}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Start Rebase' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Abort' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.queryByLabelText('Action for aaa1111')).not.toBeInTheDocument();
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
                phase="completed"
                notice={undefined}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        expect(screen.getByLabelText('Action for bbb2222')).toHaveValue('merge');
        expect(screen.getByText('Merge topology is preserved; reordering is disabled.')).toBeInTheDocument();
        expect(screen.getAllByTitle('Reordering is disabled for merge-aware plans')).toHaveLength(2);
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
                phase="planning"
                notice={undefined}
                conflictFiles={[]}
                onStart={onStart}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        fireEvent.click(screen.getByText('merge branch'));
        fireEvent.change(screen.getByLabelText('Action for bbb2222'), { target: { value: 'reword' } });
        fireEvent.change(screen.getByLabelText('Reword message'), { target: { value: 'merge: better message' } });
        fireEvent.click(screen.getByRole('button', { name: 'Start Rebase' }));

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
                phase="paused"
                notice={{ message: 'Interactive rebase already in progress.' }}
                conflictFiles={[]}
                onStart={() => {}}
                onContinue={() => {}}
                onAbort={() => {}}
                onSkip={() => {}}
                onOpenMergeEditor={() => {}}
                onMarkResolved={() => {}}
                onAcceptYours={() => {}}
                onAcceptIncoming={() => {}}
                onCancel={() => {}}
                onReviewPlan={() => {}}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Rebase Paused' })).toBeInTheDocument();
        expect(screen.getByText('Interactive rebase already in progress.')).toBeInTheDocument();
        expect(screen.queryByLabelText('Rebase paused')).toBeInTheDocument();
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
