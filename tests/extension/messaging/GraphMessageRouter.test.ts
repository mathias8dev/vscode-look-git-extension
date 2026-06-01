import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, resetMockVscode, setInputBoxValue, setQuickPickValue, setWarningChoice, Uri, window, workspace } from '../../mocks/vscode';

describe('GraphMessageRouter commit commands', () => {
    beforeEach(resetMockVscode);

    it('copies the selected revision number', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'copyRevisionNumber', hash: 'abc123', hashes: ['abc123'] });

        expect(env.clipboard.value).toBe('abc123');
    });

    it('cherry-picks selected commits from oldest to newest', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'rev-list' ? 'c\nb\na' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: 'c', hashes: ['a', 'b', 'c'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['rev-list', '--topo-order', 'a', 'b', 'c']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['cherry-pick', 'a', 'b', 'c']);
    });

    it('creates branches and tags at the selected revision', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setInputBoxValue('release/test');
        await router.handle({ type: 'graph/commitCommand', command: 'newBranch', hash: 'abc123', hashes: ['abc123'] });
        setInputBoxValue('v1.2.3');
        await router.handle({ type: 'graph/commitCommand', command: 'newTag', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['branch', 'release/test', 'abc123']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['tag', 'v1.2.3', 'abc123']);
    });

    it('opens compare-with-local output as a diff document', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'diff --git a/file b/file\n'),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'compareWithLocal', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['diff', 'abc123', '--']);
        expect(workspace.documents).toEqual([{ content: 'diff --git a/file b/file\n', language: 'diff' }]);
        expect(window.shownDocuments).toHaveLength(1);
    });

    it('starts interactive rebase in a terminal', async () => {
        const repo = makeRepositoryMock({ cwd: '/repo' });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'interactiveRebaseFromHere', hash: 'abc123', hashes: ['abc123'] });

        expect(window.terminals).toEqual([expect.objectContaining({
            name: 'Look Git',
            cwd: '/repo',
            texts: ["git rebase --autostash -i 'abc123'"],
            visible: true,
        })]);
    });

    it('supports keep reset mode for reset-to-revision', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Keep reset');
        await router.handle({ type: 'graph/commitCommand', command: 'resetCurrentBranchToHere', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['reset', '--keep', 'abc123']);
    });

    it('writes a patch file for the selected commits', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'rev-list' ? 'b\na' : ''),
            execRaw: vi.fn(async (args) => `patch ${args.at(-1)}\n`),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const patchPath = '/tmp/look-git-router.patch';
        window.saveDialogValue = Uri.file(patchPath);

        await router.handle({ type: 'graph/commitCommand', command: 'createPatch', hash: 'b', hashes: ['a', 'b'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(1, ['format-patch', '-1', '--stdout', 'a']);
        expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(2, ['format-patch', '-1', '--stdout', 'b']);
    });

    it('confirms destructive commit commands', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'rev-parse' ? 'abc123' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setWarningChoice('Undo Commit');
        await router.handle({ type: 'graph/commitCommand', command: 'undoCommit', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['reset', '--soft', 'HEAD~1']);
        expect(commands.calls).toEqual([]);
    });
});

describe('GraphMessageRouter branch commands', () => {
    beforeEach(resetMockVscode);

    it('checks out and rebases the selected branch onto the current branch', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.checkout)).toHaveBeenCalledWith('feature/ui');
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['rebase', 'main']);
    });

    it('compares the selected branch with the current branch', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[0] === 'diff' ? 'diff --git a/file b/file\n' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['diff', 'main...feature/ui', '--']);
        expect(workspace.documents).toEqual([{ content: 'diff --git a/file b/file\n', language: 'diff' }]);
    });

    it('shows the selected branch diff against the working tree', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[0] === 'diff' ? 'diff --git a/local b/local\n' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['diff', 'feature/ui', '--']);
        expect(workspace.documents).toEqual([{ content: 'diff --git a/local b/local\n', language: 'diff' }]);
    });

    it('pushes to the configured upstream branch', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'origin/review/topic\n'),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'topic', isRemote: false });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['push', 'origin', 'topic:refs/heads/review/topic']);
    });

    it('pushes a new local branch to the first remote with upstream tracking', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
            getRemotes: vi.fn(async () => ['upstream']),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'topic', isRemote: false });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['push', '-u', 'upstream', 'topic']);
    });
});
