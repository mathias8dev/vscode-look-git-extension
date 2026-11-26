import type { GenerateSquashCommitMessageUseCase } from '@application/usecases/commits/generate-squash-commit-message';
import { CommitResultStatus } from '@protocol/changes/commit-result-status';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoKind, type RepoContext } from '@core/git/domain/repo-context';
import type { GitRuntime, GitExecutionContext } from '@application/ports/git-runtime';
import type { SemanticGitOperation } from '@application/ports/git-operation';
import { GitPushOutcome } from '@application/ports/git-capabilities';
import { PullStrategy } from '@application/ports/pull-strategy';
import { MergeStrategy } from '@application/ports/merge-strategy';
import { ChangesMessageRouter } from '@extension/messaging/changes-message-router';
import { RepositoryRegistry } from '@extension/repositories/repository-registry';
import { RuntimeGitRepository } from '@extension/git/runtime-git-repository';
import { RuntimeWorktree } from '@extension/git/runtime-worktree';
import type { ChangesExtensionToWebviewMessage } from '@protocol/changes/messages';
import { CommitMode } from '@protocol/changes/types';
import { resetMockVscode, setInputBoxValues, setQuickPickValue, setQuickPickValues, workspace } from '@tests/mocks/vscode';

describe('Changes Git options', () => {
    afterEach(resetMockVscode);

    it.each(['pull', 'sync'] as const)('uses the chosen strategy for %s', async command => {
        const fixture = setup();
        setQuickPickValue('Pull (--ff-only)');

        await fixture.router.handleToolbarCommand(command);

        expect(fixture.mutations).toEqual([
            { operation: 'pull', input: { options: { strategy: PullStrategy.FastForwardOnly } } },
            ...(command === 'sync' ? [{ operation: 'push', input: { remote: undefined, options: {} } }] : []),
        ]);
    });

    it.each(['pull', 'sync', 'stash'] as const)('does not mutate or announce success when %s is cancelled', async command => {
        const fixture = setup();

        await fixture.router.handleToolbarCommand(command);

        expect(fixture.mutations).toEqual([]);
        expect(fixture.messages).toEqual([]);
        expect(fixture.updated).not.toHaveBeenCalled();
    });

    it('uses the same strategy in a submodule repository context', async () => {
        const fixture = setup(RepoKind.Submodule);
        setQuickPickValue('Pull (--rebase)');

        await fixture.router.handleToolbarCommand('pull');

        expect(fixture.mutations).toEqual([{ operation: 'pull', input: { options: { strategy: PullStrategy.Rebase } } }]);
    });

    it('chooses the strategy before committing and syncing', async () => {
        const fixture = setup();
        setQuickPickValue('Pull (--rebase)');

        await fixture.router.handle({ type: 'changes/commit', message: 'feat: test', mode: CommitMode.CommitSync });

        expect(fixture.mutations.map(call => call.operation)).toEqual(['commit', 'pull', 'push']);
        expect(fixture.mutations[1]).toEqual({ operation: 'pull', input: { options: { strategy: PullStrategy.Rebase } } });
    });

    it('does not commit if Commit and Sync options are cancelled', async () => {
        const fixture = setup();

        await fixture.router.handle({ type: 'changes/commit', message: 'feat: test', mode: CommitMode.CommitSync });

        expect(fixture.mutations).toEqual([]);
        expect(fixture.messages).toEqual([
            { type: 'changes/commitResult', status: CommitResultStatus.Running },
            { type: 'changes/commitResult', status: CommitResultStatus.Cancelled },
        ]);
    });

    it('uses the selected pull strategy and remote branch for Pull From', async () => {
        const fixture = setup();
        setQuickPickValues(['upstream/feature/topic', 'Pull (--rebase)']);

        await fixture.router.handleToolbarCommand('pullFrom');

        expect(fixture.mutations).toEqual([{ operation: 'pull', input: {
            options: { strategy: PullStrategy.Rebase, remote: 'upstream', branch: 'feature/topic' },
        } }]);
    });

    it('uses the same merge and rebase options as graph commands', async () => {
        const fixture = setup();
        setQuickPickValues(['main', 'No-fast-forward (--no-ff)']);
        await fixture.router.handleToolbarCommand('mergeBranch');
        setQuickPickValues(['main', 'Rebase (--autostash)']);
        await fixture.router.handleToolbarCommand('rebaseBranch');

        expect(fixture.mutations).toEqual([
            { operation: 'merge', input: { ref: 'main', options: { strategy: MergeStrategy.NoFastForward } } },
            { operation: 'rebase', input: { upstream: 'main', branch: undefined, options: { rebaseMerges: false, autostash: true } } },
        ]);
    });

    it('passes both messages through the Changes merge command', async () => {
        const fixture = setup();
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        setQuickPickValues(['main', 'Squash + no-ff']);
        setInputBoxValues(['feat: combined change', 'Merge feature']);

        await fixture.router.handleToolbarCommand('mergeBranch');

        expect(fixture.mutations).toEqual([{ operation: 'merge', input: {
            ref: 'main', options: { strategy: MergeStrategy.SquashNoFastForward, squashMessage: 'feat: combined change', message: 'Merge feature' },
        } }]);
    });

    it('does not start a Changes merge when the second message is cancelled', async () => {
        const fixture = setup();
        workspace.values.set('lookGit.commitMessageEditor', 'input');
        setQuickPickValues(['main', 'Squash + no-ff']);
        setInputBoxValues(['feat: combined change']);

        await fixture.router.handleToolbarCommand('mergeBranch');

        expect(fixture.mutations).toEqual([]);
        expect(fixture.messages).toEqual([]);
    });

    it('uses the same stash scope for the toolbar and the Changes stash action', async () => {
        const fixture = setup();
        setQuickPickValue('Stash (--include-untracked)');

        await fixture.router.handleToolbarCommand('stash');
        await fixture.router.handle({ type: 'changes/stash', message: 'wip' });

        expect(fixture.mutations.map(call => call.input)).toEqual([
            { message: undefined, options: { includeUntracked: true, staged: false, keepIndex: false } },
            { message: 'wip', options: { includeUntracked: true, staged: false, keepIndex: false } },
        ]);
    });
});

function setup(kind = RepoKind.Main) {
    const context: RepoContext = { id: 'repo', cwd: '/repo', label: 'repo', kind };
    const mutations: { readonly operation: SemanticGitOperation; readonly input: unknown }[] = [];
    const messages: ChangesExtensionToWebviewMessage[] = [];
    const updated = vi.fn(async () => {});
    const runtime: GitRuntime = {
        supports: () => true,
        async execute<TInput, TResult>(operation: SemanticGitOperation, _context: GitExecutionContext, input: TInput): Promise<TResult> {
            let result: unknown;
            switch (operation) {
                case 'getStatus': result = { staged: [], unstaged: [], conflicts: [], conflictState: 'none' }; break;
                case 'listRemoteBranches':
                case 'listBranches': result = [{ name: 'main', isRemote: false, isCurrent: true }, { name: 'upstream/feature/topic', isRemote: true }]; break;
                case 'pull': case 'push': case 'merge': case 'rebase': case 'stash': case 'commit':
                    mutations.push({ operation, input });
                    result = operation === 'push' ? GitPushOutcome.Completed : undefined;
                    break;
                default: throw new Error(`Unexpected operation: ${operation}`);
            }
            return result as TResult; // Each semantic operation above returns its runtime contract result.
        },
    };
    const repository = new RuntimeGitRepository({ repoId: context.id, cwd: context.cwd, gitDir: '/repo/.git', kind: kind === RepoKind.Submodule ? 'submodule' : 'main', label: 'repo' }, runtime);
    const worktree = new RuntimeWorktree({ repoId: context.id, worktreeId: context.id, path: context.cwd, gitDir: '/repo/.git', repositoryKind: kind === RepoKind.Submodule ? 'submodule' : 'main', isMain: true, head: 'HEAD', branch: 'main', dirty: false }, runtime);
    const registry = new RepositoryRegistry();
    registry.registerRepository(repository);
    registry.registerWorktree(worktree);
    const generateSquashMessage = { execute: vi.fn(async () => 'feat: generated change') } as unknown as GenerateSquashCommitMessageUseCase; // The router double isolates message selection from the generation use-case.
    const router = new ChangesMessageRouter({ currentContext: context, contexts: [context] }, message => { messages.push(message); }, async () => {}, updated, undefined, registry, undefined, generateSquashMessage);
    return { router, mutations, messages, updated, repository, worktree };
}
