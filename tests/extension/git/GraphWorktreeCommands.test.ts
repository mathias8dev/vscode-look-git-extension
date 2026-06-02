import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { GraphExtensionToWebviewMessage } from '../../../src/protocol/graph/messages';
import { addLinkedWorktree, createBareGitRepo, createTempGitRepo, type TempGitRepo } from '../../helpers/gitRepo';
import { makeRepositoryAccessor } from '../../helpers/repositoryMock';
import { commands, resetMockVscode, setInputBoxValue, setQuickPickValue, setWarningChoice, setWarningChoices } from '../../mocks/vscode';

describe('Graph worktree context commands against real git repos', () => {
    let fixture: TempGitRepo;
    let remote: TempGitRepo;
    const cleanups: Array<() => void> = [];

    beforeEach(() => {
        resetMockVscode();
        fixture = createTempGitRepo();
        remote = createBareGitRepo();
    });

    afterEach(() => {
        while (cleanups.length > 0) {
            cleanups.pop()?.();
        }
        remote.cleanup();
        fixture.cleanup();
    });

    it('runs window, reveal, diff, fetch, pull, push, commit, stash, branch, and lock actions in the selected worktree', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['remote', 'add', 'origin', remote.cwd]);
        fixture.git(['push', '-u', 'origin', 'main']);
        const linked = addLinkedWorktree(fixture, 'feature/worktree-context');
        cleanups.push(linked.cleanup);
        const worktreePath = linked.worktreePath;
        fixture.git(['-C', worktreePath, 'push', '-u', 'origin', 'feature/worktree-context']);
        fixture.git(['branch', 'feature/checkout-target']);
        const router = routerFor(fixture.cwd);

        setQuickPickValue('Open in Current Window');
        await router.handle({ type: 'graph/worktreeCommand', command: 'open', path: worktreePath });
        await router.handle({ type: 'graph/worktreeCommand', command: 'openInNewWindow', path: worktreePath });
        await router.handle({ type: 'graph/worktreeCommand', command: 'reveal', path: worktreePath });

        expect(commands.calls.filter((call) => call.command === 'vscode.openFolder').map((call) => call.args[1])).toEqual([
            { forceNewWindow: false },
            { forceNewWindow: true },
        ]);
        expect(commands.calls.some((call) => call.command === 'revealFileInOS')).toBe(true);

        await router.handle({ type: 'graph/worktreeCommand', command: 'fetch', path: worktreePath });
        await router.handle({ type: 'graph/worktreeCommand', command: 'pull', path: worktreePath });

        writeFileSync(join(worktreePath, 'base.txt'), 'base from worktree\n');
        writeFileSync(join(worktreePath, 'untracked-diff.txt'), 'untracked diff\n');
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithHead', path: worktreePath });
        await router.handle({ type: 'graph/worktreeCommand', command: 'showDiffWithMainWorktree', path: worktreePath });

        expect(commands.calls.filter((call) => call.command === 'vscode.changes')).toHaveLength(2);

        writeFileSync(join(worktreePath, 'committed.txt'), 'committed\n');
        setWarningChoice('Stage All and Commit');
        setInputBoxValue('feat(worktrees): commit from context action');
        await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: worktreePath });
        expect(fixture.gitTrim(['-C', worktreePath, 'log', '-1', '--format=%s'])).toBe('feat(worktrees): commit from context action');
        expect(fixture.gitTrim(['-C', worktreePath, 'status', '--short'])).toBe('');

        await router.handle({ type: 'graph/worktreeCommand', command: 'push', path: worktreePath });
        expect(remote.gitTrim(['rev-parse', 'feature/worktree-context'])).toBe(fixture.gitTrim(['-C', worktreePath, 'rev-parse', 'HEAD']));

        writeFileSync(join(worktreePath, 'stashed.txt'), 'stashed\n');
        setInputBoxValue('wip(worktrees): context stash');
        await router.handle({ type: 'graph/worktreeCommand', command: 'stash', path: worktreePath });
        expect(fixture.gitTrim(['-C', worktreePath, 'status', '--short'])).toBe('');
        expect(fixture.gitTrim(['-C', worktreePath, 'stash', 'list'])).toMatch(/wip\(worktrees\): context stash/);

        setInputBoxValue('feature/from-worktree-head');
        await router.handle({ type: 'graph/worktreeCommand', command: 'newBranch', path: worktreePath });
        expect(fixture.gitTrim(['-C', worktreePath, 'branch', '--show-current'])).toBe('feature/from-worktree-head');

        setQuickPickValue('feature/checkout-target');
        await router.handle({ type: 'graph/worktreeCommand', command: 'checkoutBranch', path: worktreePath });
        expect(fixture.gitTrim(['-C', worktreePath, 'branch', '--show-current'])).toBe('feature/checkout-target');

        await router.handle({ type: 'graph/worktreeCommand', command: 'lock', path: worktreePath });
        expect(fixture.gitTrim(['worktree', 'list', '--porcelain'])).toMatch(/locked/);
        await router.handle({ type: 'graph/worktreeCommand', command: 'unlock', path: worktreePath });
        expect(fixture.gitTrim(['worktree', 'list', '--porcelain'])).not.toMatch(/locked/);
    });

    it('removes linked worktrees only after the expected confirmations', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const removable = addLinkedWorktree(fixture, 'feature/worktree-remove');
        const forceRemovable = addLinkedWorktree(fixture, 'feature/worktree-force-remove');
        cleanups.push(removable.cleanup, forceRemovable.cleanup);
        const router = routerFor(fixture.cwd);

        writeFileSync(join(forceRemovable.worktreePath, 'discarded.txt'), 'discarded\n');
        setWarningChoices(['Force Remove']);
        await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: forceRemovable.worktreePath });
        expect(existsSync(forceRemovable.worktreePath)).toBe(true);

        setWarningChoices(['Force Remove', 'Discard Changes and Remove']);
        await router.handle({ type: 'graph/worktreeCommand', command: 'removeForce', path: forceRemovable.worktreePath });
        expect(existsSync(forceRemovable.worktreePath)).toBe(false);

        setWarningChoice('Remove');
        await router.handle({ type: 'graph/worktreeCommand', command: 'remove', path: removable.worktreePath });
        expect(existsSync(removable.worktreePath)).toBe(false);
    });
});

function routerFor(cwd: string, messages: GraphExtensionToWebviewMessage[] = []): GraphMessageRouter {
    const repo = new GitProcessRepository(cwd);
    return new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });
}
