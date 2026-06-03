import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GitGraphCommit } from '../../../src/core/git/domain/GitCommit';
import type { GitWorktree } from '../../../src/core/git/domain/GitWorktree';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { GraphDataResponse, GraphExtensionToWebviewMessage, WorktreeDetailsResponse } from '../../../src/protocol/graph/messages';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, resetMockVscode, setInputBoxValue, setInputBoxValues, setQuickPickValue, setWarningChoice, setWarningChoices, Uri, window, workspace } from '../../mocks/vscode';

describe('GraphMessageRouter graph data', () => {
    beforeEach(resetMockVscode);

    it('includes every dirty worktree WIP row even when they share a commit', async () => {
        const head = '1234567890abcdef';
        const execRaw = vi.fn(async (args: readonly string[]) => {
            if (args[1] === '/repo/.worktrees/a') { return ' M dirty.ts\0M  staged.ts\0?? new.ts\0'; }
            if (args[1] === '/repo/.worktrees/b') { return 'UU conflict.ts\0'; }
            return '';
        });
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [graphCommit(head)]),
            listWorktrees: vi.fn(async () => [
                worktree('/repo/.worktrees/a', head, 'feature/a'),
                worktree('/repo/.worktrees/b', head, 'feature/b'),
            ]),
            execRaw,
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-worktrees',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        const response = graphDataResponse(messages, 'graph-worktrees');
        expect(response.data.worktreeWips).toEqual([
            {
                path: '/repo/.worktrees/a',
                head,
                branch: 'feature/a',
                staged: 1,
                unstaged: 1,
                untracked: 1,
                conflicts: 0,
            },
            {
                path: '/repo/.worktrees/b',
                head,
                branch: 'feature/b',
                staged: 0,
                unstaged: 0,
                untracked: 0,
                conflicts: 1,
            },
        ]);
        expect(execRaw).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'status', '--porcelain=v1', '-z', '-u'], expect.any(AbortSignal));
        expect(execRaw).toHaveBeenCalledWith(['-C', '/repo/.worktrees/b', 'status', '--porcelain=v1', '-z', '-u'], expect.any(AbortSignal));
    });

    it('reports optional worktree WIP status failures and still returns graph data', async () => {
        const head = '1234567890abcdef';
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [graphCommit(head)]),
            listWorktrees: vi.fn(async () => [worktree('/repo/.worktrees/a', head, 'feature/a')]),
            execRaw: vi.fn(async () => { throw new Error('status failed'); }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-worktree-error',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        const error = messages.find((message) => message.type === 'graph/error');
        expect(error?.error).toMatchObject({
            code: 'optionalDataUnavailable',
            operation: 'graph/worktreeWipStatus',
            recoverable: true,
        });
        expect(graphDataResponse(messages, 'graph-worktree-error').data.worktreeWips).toEqual([]);
    });

    it('loads worktree detail files from porcelain status', async () => {
        const head = '1234567890abcdef';
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [worktree('/repo/.worktrees/a', head, 'feature/a')]),
            execRaw: vi.fn(async () => ' M dirty.ts\0M  staged.ts\0?? new.ts\0UU conflict.ts\0'),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/worktreeDetailsRequest',
            requestId: 'worktree-details',
            path: '/repo/.worktrees/a',
        });

        const response = worktreeDetailsResponse(messages, 'worktree-details');
        expect(response).toMatchObject({
            path: '/repo/.worktrees/a',
            head,
            branch: 'feature/a',
        });
        expect(response.files).toEqual([
            { status: 'U', filePath: 'conflict.ts', origPath: undefined },
            { status: 'M', filePath: 'dirty.ts', origPath: undefined },
            { status: '?', filePath: 'new.ts', origPath: undefined },
            { status: 'M', filePath: 'staged.ts', origPath: undefined },
        ]);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'status', '--porcelain=v1', '-z', '-u']);
    });

    it('opens worktree file diffs against HEAD', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'head content\n'),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({
            type: 'graph/openWorktreeDiff',
            worktreePath: '/repo/.worktrees/a',
            filePath: 'src/dirty.ts',
            status: 'M',
        });

        expect(commands.calls).toHaveLength(1);
        const call = commands.calls[0];
        expect(call?.command).toBe('vscode.diff');
        expect(String(call?.args[0])).toContain('look-git-empty-diffs');
        expect(String(call?.args[1])).toBe('file:/repo/.worktrees/a/src/dirty.ts');
        expect(call?.args[2]).toBe('dirty.ts (a)');
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'show', 'HEAD:src/dirty.ts']);
    });

    it('runs worktree window and reveal commands', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Open in Current Window');
        await router.handle({ type: 'graph/worktreeCommand', command: 'open', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'openInNewWindow', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'reveal', path: '/repo/.worktrees/a' });

        expect(commands.calls).toEqual([
            { command: 'vscode.openFolder', args: [Uri.file('/repo/.worktrees/a'), { forceNewWindow: false }] },
            { command: 'vscode.openFolder', args: [Uri.file('/repo/.worktrees/a'), { forceNewWindow: true }] },
            { command: 'revealFileInOS', args: [Uri.file('/repo/.worktrees/a')] },
        ]);
    });

    it('opens worktree diff documents', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true },
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
            execRaw: vi.fn(async (args) => {
                if (args[2] === 'diff' && args[5] === 'HEAD') { return 'M\0head.txt\0'; }
                if (args[2] === 'diff' && args[5] === 'main-head') { return 'M\0main.txt\0'; }
                if (args[2] === 'ls-files') { return ''; }
                return '';
            }),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithHead', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithMainWorktree', path: '/repo/.worktrees/a' });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--name-status', '-z', 'HEAD', '--']);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'ls-files', '--others', '--exclude-standard', '-z']);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--name-status', '-z', 'main-head', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes', 'vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
        expect(changesResourcesAt(1)).toHaveLength(1);
    });

    it('runs worktree git commands in the selected worktree', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[2] === 'status' ? 'A  committed.txt\0' : ''),
            getAllBranches: vi.fn(async () => [
                { name: 'main', isRemote: false, isCurrent: true, hash: 'main-head', ahead: 0, behind: 0 },
                { name: 'feature/a', isRemote: false, isCurrent: false, hash: 'topic-head', ahead: 0, behind: 0 },
            ]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/worktreeCommand', command: 'fetch', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'pull', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'push', path: '/repo/.worktrees/a' });
        setInputBoxValue('feat: worktree commit');
        await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: '/repo/.worktrees/a' });
        setInputBoxValue('wip: worktree stash');
        await router.handle({ type: 'graph/worktreeCommand', command: 'stash', path: '/repo/.worktrees/a' });
        setInputBoxValue('feature/new');
        await router.handle({ type: 'graph/worktreeCommand', command: 'newBranch', path: '/repo/.worktrees/a' });
        setQuickPickValue('feature/a');
        await router.handle({ type: 'graph/worktreeCommand', command: 'checkoutBranch', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'lock', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'unlock', path: '/repo/.worktrees/a' });

        expect(window.terminals.slice(0, 3)).toEqual([
            expect.objectContaining({ name: 'Look Git Remote: Worktree', cwd: '/repo/.worktrees/a', hideFromUser: true, isTransient: true, texts: ["git 'fetch'"], visible: false }),
            expect.objectContaining({ name: 'Look Git Remote: Worktree', cwd: '/repo/.worktrees/a', hideFromUser: true, isTransient: true, texts: ["git 'pull'"], visible: false }),
            expect.objectContaining({ name: 'Look Git Remote: Worktree', cwd: '/repo/.worktrees/a', hideFromUser: true, isTransient: true, texts: ["git 'push'"], visible: false }),
        ]);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'status', '--porcelain=v1', '-z', '-u']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'commit', '-m', 'feat: worktree commit']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'stash', 'push', '-u', '-m', 'wip: worktree stash']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'checkout', '-b', 'feature/new']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'checkout', 'feature/a']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'lock', '/repo/.worktrees/a']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'unlock', '/repo/.worktrees/a']);
    });

    it('stages all worktree changes before committing when no files are staged', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[2] === 'status' ? ' M dirty.txt\0?? new.txt\0' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setWarningChoice('Stage All and Commit');
        setInputBoxValue('feat(worktrees): commit dirty worktree');
        await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: '/repo/.worktrees/a' });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'add', '-A']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'commit', '-m', 'feat(worktrees): commit dirty worktree']);
    });

    it('can commit only staged worktree changes when unstaged files also exist', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[2] === 'status' ? 'M  staged.txt\0 M dirty.txt\0' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Commit Staged Changes');
        setInputBoxValue('feat(worktrees): commit staged worktree files');
        await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: '/repo/.worktrees/a' });

        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'add', '-A']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'commit', '-m', 'feat(worktrees): commit staged worktree files']);
    });

    it('confirms worktree removal and blocks removing the main worktree', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true },
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        setWarningChoice('Remove');
        await router.handle({ type: 'graph/worktreeCommand', command: 'remove', path: '/repo/.worktrees/a' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: '/repo' });

        expect(vi.mocked(repo.removeWorktree)).toHaveBeenCalledWith('/repo/.worktrees/a', false);
        const error = messages.find((message) => message.type === 'graph/error');
        expect(error?.message).toContain('main worktree cannot be removed');
    });

    it('requires two confirmations before force removing a worktree', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true },
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setWarningChoices(['Force Remove']);
        await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: '/repo/.worktrees/a' });
        expect(vi.mocked(repo.removeWorktree)).not.toHaveBeenCalled();

        setWarningChoices(['Force Remove', 'Discard Changes and Remove']);
        await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: '/repo/.worktrees/a' });

        expect(vi.mocked(repo.removeWorktree)).toHaveBeenCalledWith('/repo/.worktrees/a', true);
    });

    it('blocks locking and unlocking the main worktree', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true },
            ]),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({ type: 'graph/worktreeCommand', command: 'lock', path: '/repo' });
        await router.handle({ type: 'graph/worktreeCommand', command: 'unlock', path: '/repo' });

        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['worktree', 'lock', '/repo']);
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['worktree', 'unlock', '/repo']);
        const errors = messages.filter((message): message is Extract<GraphExtensionToWebviewMessage, { readonly type: 'graph/error' }> => message.type === 'graph/error');
        expect(errors.map((message) => message.message)).toEqual([
            'The main worktree cannot be locked.',
            'The main worktree cannot be unlocked.',
        ]);
    });
});

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

    it('creates a new branch and worktree at the selected revision', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const worktreePath = missingPath('look-git-commit-wt-');

        setInputBoxValues([worktreePath, 'feature/from-commit']);
        await router.handle({ type: 'graph/commitCommand', command: 'newWorktreeFromCommit', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'add', '-b', 'feature/from-commit', worktreePath, 'abc123']);
    });

    it('compares a selected commit with a chosen worktree', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
            execRaw: vi.fn(async (args) => {
                if (args[2] === 'diff' && args[5] === 'abc123') { return 'M\0commit.txt\0'; }
                if (args[2] === 'ls-files') { return ''; }
                return '';
            }),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('/repo/.worktrees/a');
        await router.handle({ type: 'graph/commitCommand', command: 'compareCommitWithWorktree', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--name-status', '-z', 'abc123', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
    });

    it('opens compare-with-local output in the changes editor', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[2] === 'diff' ? 'M\0file.ts\0' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'compareWithLocal', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/workspace', 'diff', '--name-status', '-z', 'abc123', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
        expect(workspace.documents).toEqual([]);
        expect(window.shownDocuments).toHaveLength(0);
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

function graphCommit(hash: string): GitGraphCommit {
    return {
        hash,
        shortHash: hash.substring(0, 7),
        message: 'feat(graph): add worktree graph',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        authorDate: '2024-01-01T00:00:00Z',
        parentHashes: [],
        refs: [],
    };
}

function worktree(path: string, head: string, branch: string): GitWorktree {
    return {
        path,
        head,
        branch,
        isMain: false,
        isDetached: false,
        isLocked: false,
    };
}

function graphDataResponse(messages: readonly GraphExtensionToWebviewMessage[], requestId: string): GraphDataResponse {
    const response = messages.find((message): message is GraphDataResponse => (
        message.type === 'graph/dataResponse' && message.requestId === requestId
    ));
    if (!response) { throw new Error(`Expected graph/dataResponse for ${requestId}.`); }
    return response;
}

function worktreeDetailsResponse(messages: readonly GraphExtensionToWebviewMessage[], requestId: string): WorktreeDetailsResponse {
    const response = messages.find((message): message is WorktreeDetailsResponse => (
        message.type === 'graph/worktreeDetailsResponse' && message.requestId === requestId
    ));
    if (!response) { throw new Error(`Expected graph/worktreeDetailsResponse for ${requestId}.`); }
    return response;
}

function missingPath(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    fs.rmSync(dir, { recursive: true, force: true });
    return dir;
}

describe('GraphMessageRouter branch commands', () => {
    beforeEach(resetMockVscode);

    it('fetches all remotes from repository commands and refreshes the graph', async () => {
        const repo = makeRepositoryMock();
        const messages: GraphExtensionToWebviewMessage[] = [];
        const onRepositoryUpdated = vi.fn(async () => {});
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); }, onRepositoryUpdated);

        await router.handle({ type: 'graph/repositoryCommand', command: 'fetch' });

        expect(commands.calls).toContainEqual({ command: 'git.fetchAll', args: [] });
        expect(vi.mocked(repo.fetchAll)).not.toHaveBeenCalled();
        expect(messages).toContainEqual({ type: 'graph/refreshRequested' });
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
    });

    it('checks out and rebases the selected branch onto the current branch', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.checkout)).toHaveBeenCalledWith('feature/ui');
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['rebase', 'main']);
    });

    it('compares the selected branch with the current branch', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'merge-base' ? 'base123' : ''),
            execRaw: vi.fn(async (args) => args[0] === 'diff' ? 'M\0file.ts\0' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['merge-base', 'main', 'feature/ui']);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['diff', '--name-status', '-z', 'base123', 'feature/ui', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
    });

    it('shows the selected branch diff against the working tree', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[2] === 'diff' ? 'M\0local.ts\0' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'feature/ui', isRemote: false });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/workspace', 'diff', '--name-status', '-z', 'feature/ui', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
    });

    it('notifies dependent views when merge commands fail after partially updating the repository', async () => {
        const repo = makeRepositoryMock({
            merge: vi.fn(async () => { throw new Error('Automatic merge failed; fix conflicts and then commit the result.'); }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const onRepositoryUpdated = vi.fn(async () => {});
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); }, onRepositoryUpdated);

        await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'feature/conflict', isRemote: false });

        expect(messages).toContainEqual(expect.objectContaining({ type: 'graph/error' }));
        expect(messages).toContainEqual({ type: 'graph/refreshRequested' });
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
        expect(window.errorMessages.at(-1)).toContain('Automatic merge failed');
    });

    it('updates the selected local branch from its configured upstream', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async (args) => args[0] === 'for-each-ref' ? 'origin/review/topic\n' : ''),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const onRepositoryUpdated = vi.fn(async () => {});
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); }, onRepositoryUpdated);

        await router.handle({ type: 'graph/branchCommand', command: 'update', branch: 'topic', isRemote: false });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['for-each-ref', '--format=%(upstream:short)', 'refs/heads/topic']);
        expect(commands.calls).toContainEqual({ command: 'git.fetchAll', args: [] });
        expect(vi.mocked(repo.fetchBranch)).not.toHaveBeenCalled();
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['merge-base', '--is-ancestor', 'topic', 'origin/review/topic']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['branch', '-f', 'topic', 'origin/review/topic']);
        expect(messages).toContainEqual({ type: 'graph/refreshRequested' });
        expect(onRepositoryUpdated).toHaveBeenCalledOnce();
    });

    it('rejects update selected for remote branches', async () => {
        const repo = makeRepositoryMock();
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({ type: 'graph/branchCommand', command: 'update', branch: 'origin/topic', isRemote: true });

        expect(vi.mocked(repo.fetchBranch)).not.toHaveBeenCalled();
        expect(messages.some((message) => message.type === 'graph/error')).toBe(true);
        expect(window.errorMessages.at(-1)).toContain('Update selected branch is only available for local branches.');
    });

    it('pushes to the configured upstream branch', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => 'origin/review/topic\n'),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'topic', isRemote: false });

        expect(window.terminals).toContainEqual(expect.objectContaining({
            name: 'Look Git Remote: topic',
            cwd: '/workspace',
            hideFromUser: true,
            isTransient: true,
            texts: ["git 'push' 'origin' 'topic:refs/heads/review/topic'"],
            visible: false,
        }));
    });

    it('pushes a new local branch to the first remote with upstream tracking', async () => {
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
            getRemotes: vi.fn(async () => ['upstream']),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'topic', isRemote: false });

        expect(window.terminals).toContainEqual(expect.objectContaining({
            name: 'Look Git Remote: topic',
            cwd: '/workspace',
            hideFromUser: true,
            isTransient: true,
            texts: ["git 'push' '-u' 'upstream' 'topic'"],
            visible: false,
        }));
    });

    it('creates a worktree from a branch that is not already checked out', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true, branch: 'refs/heads/main' },
            ]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const worktreePath = missingPath('look-git-feature-wt-');

        setInputBoxValue(worktreePath);
        await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'feature/a', isRemote: false });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'add', worktreePath, 'feature/a']);
    });

    it('creates a new branch when adding a worktree from an already checked out branch', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true, branch: 'refs/heads/main' },
                { ...worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'), branch: 'refs/heads/feature/a' },
            ]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const worktreePath = missingPath('look-git-feature-copy-');

        setInputBoxValues([worktreePath, 'feature/a-copy']);
        await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'feature/a', isRemote: false });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'add', '-b', 'feature/a-copy', worktreePath, 'feature/a']);
    });

    it('reuses an existing local branch when adding a worktree from its remote branch', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true, branch: 'refs/heads/main' },
            ]),
            getAllBranches: vi.fn(async () => [
                { name: 'feature/a', isRemote: false, isCurrent: false, hash: 'topic-head', ahead: 0, behind: 0, upstream: 'origin/feature/a' },
                { name: 'origin/feature/a', isRemote: true, isCurrent: false, hash: 'topic-head', ahead: 0, behind: 0 },
            ]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const worktreePath = missingPath('look-git-remote-feature-wt-');

        setInputBoxValue(worktreePath);
        await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'origin/feature/a', isRemote: true });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'add', worktreePath, 'feature/a']);
    });

    it('runs branch worktree actions against the worktree checked out for that branch', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true, branch: 'refs/heads/main' },
                { ...worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'), branch: 'refs/heads/feature/a' },
            ]),
            execRaw: vi.fn(async (args) => {
                if (args[2] === 'diff' && args[5] === 'feature/a') { return 'M\0branch-worktree.ts\0'; }
                if (args[2] === 'for-each-ref') { return ''; }
                if (args[2] === 'ls-files') { return ''; }
                return '';
            }),
            getRemotes: vi.fn(async () => ['origin']),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Open in Current Window');
        await router.handle({ type: 'graph/branchCommand', command: 'openBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'revealBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'pullBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'pushBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'lockBranchWorktree', branch: 'feature/a', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'unlockBranchWorktree', branch: 'feature/a', isRemote: false });
        setWarningChoice('Remove');
        await router.handle({ type: 'graph/branchCommand', command: 'removeBranchWorktree', branch: 'feature/a', isRemote: false });

        expect(commands.calls).toEqual([
            { command: 'vscode.openFolder', args: [Uri.file('/repo/.worktrees/a'), { forceNewWindow: false }] },
            { command: 'revealFileInOS', args: [Uri.file('/repo/.worktrees/a')] },
            { command: 'vscode.changes', args: ['Diff feature/a with a', changesResourcesAt(2)] },
        ]);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--name-status', '-z', 'feature/a', '--']);
        expect(window.terminals).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'Look Git Remote: feature/a',
                cwd: '/repo/.worktrees/a',
                hideFromUser: true,
                isTransient: true,
                texts: ["git 'pull'"],
                visible: false,
            }),
            expect.objectContaining({
                name: 'Look Git Remote: feature/a',
                cwd: '/repo/.worktrees/a',
                hideFromUser: true,
                isTransient: true,
                texts: ["git 'push' '-u' 'origin' 'feature/a'"],
                visible: false,
            }),
        ]));
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'lock', '/repo/.worktrees/a']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['worktree', 'unlock', '/repo/.worktrees/a']);
        expect(vi.mocked(repo.removeWorktree)).toHaveBeenCalledWith('/repo/.worktrees/a', false);
    });

    it('pushes branch worktrees to their configured upstream branch', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'), branch: 'refs/heads/feature/a' },
            ]),
            execRaw: vi.fn(async (args) => args[2] === 'for-each-ref' ? 'origin/review/a\n' : ''),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/branchCommand', command: 'pushBranchWorktree', branch: 'feature/a', isRemote: false });

        expect(window.terminals).toContainEqual(expect.objectContaining({
            name: 'Look Git Remote: feature/a',
            cwd: '/repo/.worktrees/a',
            hideFromUser: true,
            isTransient: true,
            texts: ["git 'push' 'origin' 'feature/a:refs/heads/review/a'"],
            visible: false,
        }));
    });

    it('compares a branch with a chosen worktree', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
            execRaw: vi.fn(async (args) => {
                if (args[2] === 'diff' && args[5] === 'feature/a') { return 'M\0chosen.ts\0'; }
                if (args[2] === 'ls-files') { return ''; }
                return '';
            }),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('/repo/.worktrees/a');
        await router.handle({ type: 'graph/branchCommand', command: 'compareBranchWithWorktree', branch: 'feature/a', isRemote: false });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--name-status', '-z', 'feature/a', '--']);
        expect(commands.calls.map((call) => call.command)).toEqual(['vscode.changes']);
        expect(changesResourcesAt(0)).toHaveLength(1);
    });
});

function changesResourcesAt(callIndex: number): readonly unknown[] {
    const resources = commands.calls[callIndex]?.args[1];
    if (!Array.isArray(resources)) { throw new Error(`Expected vscode.changes resources at call ${callIndex}.`); }
    for (const resource of resources) {
        if (!Array.isArray(resource)) { throw new Error(`Expected vscode.changes resource tuple at call ${callIndex}.`); }
        for (const uri of resource) {
            expect(String(uri).startsWith('git:')).toBe(false);
        }
    }
    return resources;
}
