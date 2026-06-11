import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { HistoryCommitContextTarget, HistoryContextTarget, HistoryFileContextTarget } from '../../../src/protocol/history/types';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { CommitHistoryViewProvider } from '../../../src/extension/views/CommitHistoryViewProvider';
import { registerReadonlyDiffDocumentProvider } from '../../../src/extension/utils/readonly-diff-documents';
import { createBareGitRepo, createSubmoduleFixture, createTempGitRepo, removeDirSyncWithRetry, type TempGitRepo } from '../../helpers/gitRepo';
import { executingRemoteCommandBackend } from '../../helpers/executing-remote-command-backend';
import { makeWebviewView, resetVscodeMock, type MockWebviewView } from '../../helpers/providerRuntime';
import { makeRepositoryAccessor } from '../../helpers/repositoryMock';
import { env, getCommandCalls, lm, setInputBoxValue, setInputBoxValues, setQuickPickValue, setWarningChoice, window, workspace } from '../../mocks/vscode';

describe('CommitHistoryViewProvider native context command semantics', () => {
    const repos: TempGitRepo[] = [];
    const disposables: vscode.Disposable[] = [];
    const linkedWorktrees: Array<{ readonly repo: TempGitRepo; readonly path: string; readonly cleanupParent?: boolean }> = [];

    beforeEach(resetVscodeMock);

    afterEach(() => {
        while (disposables.length > 0) {
            disposables.pop()?.dispose();
        }
        while (linkedWorktrees.length > 0) {
            const worktree = linkedWorktrees.pop();
            if (!worktree) { continue; }
            try { worktree.repo.git(['worktree', 'remove', '--force', worktree.path]); } catch {}
            removeDirSyncWithRetry(worktree.path);
            if (worktree.cleanupParent) {
                removeDirSyncWithRetry(dirname(worktree.path));
            }
        }
        while (repos.length > 0) {
            repos.pop()?.cleanup();
        }
    });

    it('runs read-only native history commands against the selected commit', async () => {
        const fixture = trackRepo(createTempGitRepo());
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        const { view } = await createHistoryHarness(fixture.cwd);
        const patchPath = join(fixture.cwd, 'selected.patch');

        setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head, base], parentHash: base, canUndoCommit: true });

        await vscode.commands.executeCommand('lookGit.history.copyRevisionNumber');
        expect(env.clipboard.value).toBe(head);

        setQuickPickValue('Save Patch to File...');
        window.saveDialogValue = vscode.Uri.file(patchPath);
        await vscode.commands.executeCommand('lookGit.history.createPatch');
        expect(readFileSync(patchPath, 'utf8')).toMatch(/Subject: \[PATCH\] feat: base/);
        expect(readFileSync(patchPath, 'utf8')).toMatch(/Subject: \[PATCH\] feat: head/);
        expect(window.infoMessages).toContain(`Patch saved to ${patchPath}.`);

        lm.setResponse('History commit diff explained.');
        await vscode.commands.executeCommand('lookGit.history.explainDiff');
        expect(workspace.documents.at(-1)).toEqual(expect.objectContaining({
            uri: expect.objectContaining({ scheme: 'lookgit-diff' }),
            language: 'markdown',
            isDirty: false,
            content: expect.stringContaining('History commit diff explained.'),
        }));
        expect(window.shownDocuments).toHaveLength(1);

        fixture.write('head.txt', 'head local\n');
        await vscode.commands.executeCommand('lookGit.history.compareWithLocal');
        expect(getCommandCalls().at(-1)?.command).toBe('vscode.changes');

        await vscode.commands.executeCommand('lookGit.history.interactiveRebaseFromHere');
        expect(window.terminals.at(-1)?.texts).toEqual([`git rebase --autostash -i '${head}'`]);
    });

    it('opens revision snapshots, branches, tags, worktrees, and worktree diffs from native commands', async () => {
        const fixture = trackRepo(createTempGitRepo());
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.commitFile('head.txt', 'head\n', 'feat: head');
        const { view } = await createHistoryHarness(fixture.cwd);
        const worktreePath = missingTempPath('look-git-history-native-wt-');

        setCommitTarget(view, { kind: 'commit', hash: base, hashes: [base], canUndoCommit: false });

        await vscode.commands.executeCommand('lookGit.history.showRepositoryAtRevision');
        const openedPath = fsPathOf(getCommandCalls().find((call) => call.command === 'vscode.openFolder')?.args[0]);
        linkedWorktrees.push({ repo: fixture, path: openedPath, cleanupParent: true });
        expect(fixture.gitTrim(['-C', openedPath, 'rev-parse', 'HEAD'])).toBe(base);

        setInputBoxValue('feature/from-history');
        await vscode.commands.executeCommand('lookGit.history.newBranch');
        expect(fixture.gitTrim(['rev-parse', 'feature/from-history'])).toBe(base);

        setInputBoxValue('history-tag');
        await vscode.commands.executeCommand('lookGit.history.newTag');
        expect(fixture.gitTrim(['rev-parse', 'history-tag'])).toBe(base);

        setInputBoxValues([worktreePath, 'feature/history-worktree']);
        await vscode.commands.executeCommand('lookGit.history.newWorktreeFromCommit');
        linkedWorktrees.push({ repo: fixture, path: worktreePath });
        expect(fixture.gitTrim(['-C', worktreePath, 'branch', '--show-current'])).toBe('feature/history-worktree');
        expect(fixture.gitTrim(['-C', worktreePath, 'rev-parse', 'HEAD'])).toBe(base);

        writeFileSync(join(worktreePath, 'base.txt'), 'base local\n');
        // The extension picks worktrees by git's canonical path, so select using that exact form.
        setQuickPickValue(fixture.gitTrim(['-C', worktreePath, 'rev-parse', '--show-toplevel']));
        await vscode.commands.executeCommand('lookGit.history.compareCommitWithWorktree');
        expect(getCommandCalls().at(-1)?.command).toBe('vscode.changes');
    });

    it('explains commits from the selected submodule history scope', async () => {
        const { parent, subPath, cleanup } = createSubmoduleFixture();
        try {
            parent.git(['-C', subPath, 'config', 'user.email', 'test@example.com']);
            parent.git(['-C', subPath, 'config', 'user.name', 'Test User']);
            writeFileSync(join(parent.cwd, subPath, 'inner.txt'), 'inner\n');
            parent.git(['-C', subPath, 'add', 'inner.txt']);
            parent.git(['-C', subPath, 'commit', '-q', '-m', 'feat: inner']);
            const submoduleHead = parent.gitTrim(['-C', subPath, 'rev-parse', 'HEAD']);
            const { view } = await createHistoryHarness(parent.cwd);

            setQuickPickValue(`Submodule: ${subPath}`);
            await vscode.commands.executeCommand('lookGit.history.selectRepositoryScope');
            setCommitTarget(view, { kind: 'commit', hash: submoduleHead, hashes: [submoduleHead], canUndoCommit: false });

            lm.setResponse('Submodule history diff explained.');
            await vscode.commands.executeCommand('lookGit.history.explainDiff');

            expect(workspace.documents.at(-1)).toEqual(expect.objectContaining({
                uri: expect.objectContaining({ scheme: 'lookgit-diff' }),
                language: 'markdown',
                isDirty: false,
                content: expect.stringContaining(`Submodule: \`${subPath}\``),
            }));
            expect(workspace.documents.at(-1)).toEqual(expect.objectContaining({
                content: expect.stringContaining('Submodule history diff explained.'),
            }));
            expect(window.shownDocuments).toHaveLength(1);
        } finally {
            cleanup();
        }
    });

    it('applies checkout, reset, undo, revert, cherry-pick, drop, and push semantics from native commands', async () => {
        await withCommitPair(async ({ fixture, base, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: base, hashes: [base], canUndoCommit: false });
            await vscode.commands.executeCommand('lookGit.history.checkoutRevision');
            expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
        });

        await withCommitPair(async ({ fixture, base, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: base, hashes: [base], canUndoCommit: false });
            setQuickPickValue('Mixed reset');
            await vscode.commands.executeCommand('lookGit.history.resetCurrentBranchToHere');
            expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
            expect(fixture.git(['status', '--short'])).toMatch(/head\.txt/);
        });

        await withCommitPair(async ({ fixture, base, head, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head], canUndoCommit: true });
            setWarningChoice('Undo Commit');
            await vscode.commands.executeCommand('lookGit.history.undoCommit');
            expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
            expect(fixture.git(['status', '--short'])).toMatch(/^A  head\.txt/m);
        });

        await withCommitPair(async ({ fixture, head, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head], canUndoCommit: true });
            await vscode.commands.executeCommand('lookGit.history.revertCommit');
            expect(fixture.gitTrim(['log', '-1', '--format=%s'])).toBe('Revert "feat: head"');
        });

        await withCommitPair(async ({ fixture, base, view }) => {
            fixture.git(['checkout', '-q', '-b', 'feature/picks']);
            const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
            const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
            fixture.git(['checkout', '-q', 'main']);
            fixture.git(['reset', '--hard', base]);
            setCommitTarget(view, { kind: 'commit', hash: newer, hashes: [newer, older], canUndoCommit: false });
            await vscode.commands.executeCommand('lookGit.history.cherryPick');
            expect(fixture.gitTrim(['log', '--format=%s', '-2']).split('\n')).toEqual(['feat: newer', 'feat: older']);
        });

        await withCommitPair(async ({ fixture, base, head, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head], canUndoCommit: true });
            setWarningChoice('Drop');
            await vscode.commands.executeCommand('lookGit.history.dropCommit');
            expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
        });

        const remote = trackRepo(createBareGitRepo());
        await withCommitPair(async ({ fixture, head, view }) => {
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-q', 'origin', `${head}~1:refs/heads/main`]);
            setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head], canUndoCommit: true });
            setWarningChoice('Push');
            await vscode.commands.executeCommand('lookGit.history.pushAllUpToHere');
            expect(remote.gitTrim(['rev-parse', 'refs/heads/main'])).toBe(head);
        });
    });

    it('rewrites commit history from native edit, fixup, and squash commands', async () => {
        await withCommitPair(async ({ fixture, base, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: base, hashes: [base], canUndoCommit: false });
            setInputBoxValue('fix: edited base');
            await vscode.commands.executeCommand('lookGit.history.editCommitMessage');
            expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('fix: edited base\nfeat: head');
        });

        await withCommitPair(async ({ fixture, base, view }) => {
            fixture.write('fixup.txt', 'fixup\n');
            fixture.git(['add', 'fixup.txt']);
            setCommitTarget(view, { kind: 'commit', hash: base, hashes: [base], canUndoCommit: false });
            await vscode.commands.executeCommand('lookGit.history.fixup');
            expect(fixture.gitTrim(['show', 'HEAD~1:fixup.txt'])).toBe('fixup');
            expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: base\nfeat: head');
        });

        await withCommitPair(async ({ fixture, base, head, view }) => {
            setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head, base], canUndoCommit: true });
            setInputBoxValue('feat: squashed history commits');
            await vscode.commands.executeCommand('lookGit.history.squashInto');
            expect(fixture.gitTrim(['rev-list', '--count', 'HEAD'])).toBe('1');
            expect(fixture.gitTrim(['show', 'HEAD:base.txt'])).toBe('base');
            expect(fixture.gitTrim(['show', 'HEAD:head.txt'])).toBe('head');
            expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: squashed history commits');
        });
    });

    it('navigates and opens file diffs from native context commands', async () => {
        const fixture = trackRepo(createTempGitRepo());
        const base = fixture.commitFile('src/file.ts', 'base\n', 'feat: base');
        const head = fixture.commitFile('src/file.ts', 'head\n', 'feat: head');
        const { view } = await createHistoryHarness(fixture.cwd);

        setCommitTarget(view, { kind: 'commit', hash: head, hashes: [head], childHash: 'child-hash', parentHash: base, canUndoCommit: true });
        await vscode.commands.executeCommand('lookGit.history.goToChildCommit');
        await vscode.commands.executeCommand('lookGit.history.goToParentCommit');
        expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: 'child-hash' });
        expect(view.messages).toContainEqual({ type: 'history/selectCommit', hash: base });

        setFileTarget(view, {
            kind: 'file',
            commitHash: head,
            file: { status: 'M', filePath: 'src/file.ts', parentHash: base },
        });
        await vscode.commands.executeCommand('lookGit.history.openFileDiff');
        const diffCall = lastCommandCall('vscode.diff');
        expect(diffCall?.args[2]).toBe('file.ts ('.concat(head.substring(0, 7), ')'));
    });

    async function withCommitPair(run: (context: {
        readonly fixture: TempGitRepo;
        readonly base: string;
        readonly head: string;
        readonly view: MockWebviewView;
    }) => Promise<void>): Promise<void> {
        const fixture = trackRepo(createTempGitRepo());
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        const { view } = await createHistoryHarness(fixture.cwd);
        await run({ fixture, base, head, view });
    }

    async function createHistoryHarness(cwd: string): Promise<{ readonly view: MockWebviewView }> {
        const repo = new GitProcessRepository(cwd);
        const provider = new CommitHistoryViewProvider(vscode.Uri.file('/ext'), makeRepositoryAccessor(repo), async () => {}, executingRemoteCommandBackend);
        const view = makeWebviewView();

        disposables.push(registerReadonlyDiffDocumentProvider());
        disposables.push(...provider.registerNativeContextCommands());
        provider.resolveWebviewView(view);

        await vi.waitFor(() => {
            expect(view.messages.some((message) => messageType(message) === 'history/data')).toBe(true);
        }, { timeout: 10000 });
        return { view };
    }

    function trackRepo(repo: TempGitRepo): TempGitRepo {
        repos.push(repo);
        return repo;
    }

    function setCommitTarget(view: MockWebviewView, target: HistoryCommitContextTarget): void {
        setContextTarget(view, target);
    }

    function setFileTarget(view: MockWebviewView, target: HistoryFileContextTarget): void {
        setContextTarget(view, target);
    }

    function setContextTarget(view: MockWebviewView, target: HistoryContextTarget): void {
        view.messageHandler?.({ type: 'history/contextTarget', target });
    }
});

function messageType(message: unknown): string | undefined {
    if (typeof message !== 'object' || message === null || !('type' in message)) { return undefined; }
    const type = message.type;
    return typeof type === 'string' ? type : undefined;
}

function fsPathOf(value: unknown): string {
    if (typeof value === 'object' && value !== null && 'fsPath' in value) {
        const fsPath = value.fsPath;
        if (typeof fsPath === 'string') { return fsPath; }
    }
    throw new Error('Expected a VS Code URI with fsPath.');
}

function missingTempPath(prefix: string): string {
    // realpath the tmp base so the returned path matches git output (macOS resolves /var -> /private/var).
    const tempPath = mkdtempSync(join(realpathSync(tmpdir()), prefix));
    removeDirSyncWithRetry(tempPath);
    expect(existsSync(tempPath)).toBe(false);
    return tempPath;
}

function lastCommandCall(command: string): ReturnType<typeof getCommandCalls>[number] | undefined {
    const calls = getCommandCalls();
    for (let i = calls.length - 1; i >= 0; i--) {
        const call = calls[i];
        if (call?.command === command) { return call; }
    }
    return undefined;
}
