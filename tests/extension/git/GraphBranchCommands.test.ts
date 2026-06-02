import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { GraphExtensionToWebviewMessage } from '../../../src/protocol/graph/messages';
import { makeRepositoryAccessor } from '../../helpers/repositoryMock';
import { createBareGitRepo, createTempGitRepo, type TempGitRepo } from '../../helpers/gitRepo';
import { resetMockVscode, setInputBoxValue, setWarningChoice, workspace } from '../../mocks/vscode';

describe('Graph branch commands against real git repos', () => {
    let fixture: TempGitRepo;

    beforeEach(() => {
        resetMockVscode();
        fixture = createTempGitRepo();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('checks out a branch and rebases it onto the current branch', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature/topic']);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        const main = fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'feature/topic', isRemote: false });

        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/topic');
        expect(fixture.gitTrim(['merge-base', 'HEAD', 'main'])).toBe(main);
        expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: base\nfeat: main\nfeat: feature');
    });

    it('rebases the current branch onto the selected branch', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature/base', base]);
        const selected = fixture.commitFile('selected.txt', 'selected\n', 'feat: selected');
        fixture.git(['checkout', '-q', 'main']);
        fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/branchCommand', command: 'rebaseOnto', branch: 'feature/base', isRemote: false });

        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('main');
        expect(fixture.gitTrim(['merge-base', 'HEAD', 'feature/base'])).toBe(selected);
        expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: base\nfeat: selected\nfeat: main');
    });

    it('merges the selected branch into the current branch', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature/merge', base]);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'feature/merge', isRemote: false });

        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('main');
        expect(fixture.gitTrim(['show', 'HEAD:feature.txt'])).toBe('feature');
        expect(fixture.gitTrim(['log', '-1', '--format=%P']).split(' ')).toHaveLength(2);
    });

    it('creates, renames, and deletes a branch from a selected branch', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'source']);
        const source = fixture.commitFile('source.txt', 'source\n', 'feat: source');
        fixture.git(['checkout', '-q', 'main']);
        const router = routerFor(fixture.cwd);

        setInputBoxValue('created/from-source');
        await router.handle({ type: 'graph/branchCommand', command: 'newBranchFrom', branch: 'source', isRemote: false });
        expect(fixture.gitTrim(['rev-parse', 'created/from-source'])).toBe(source);
        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('created/from-source');

        setInputBoxValue('renamed/from-source');
        await router.handle({ type: 'graph/branchCommand', command: 'rename', branch: 'created/from-source', isRemote: false });
        expect(fixture.gitTrim(['rev-parse', 'renamed/from-source'])).toBe(source);

        fixture.git(['checkout', '-q', 'main']);
        setWarningChoice('Delete');
        await router.handle({ type: 'graph/branchCommand', command: 'delete', branch: 'renamed/from-source', isRemote: false });
        expect(fixture.gitTrim(['branch', '--list', 'renamed/from-source'])).toBe('');
    });

    it('opens branch compare and working tree diff documents', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature/diff']);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        fixture.write('base.txt', 'working tree\n');
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'feature/diff', isRemote: false });
        await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'feature/diff', isRemote: false });

        expect(workspace.documents[0]?.content).toContain('feature.txt');
        expect(workspace.documents[1]?.content).toContain('working tree');
    });

    it('pushes a local branch to its upstream and deletes remote branches', async () => {
        const remote = createBareGitRepo();
        try {
            fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            fixture.git(['checkout', '-q', '-b', 'feature/push']);
            fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
            const router = routerFor(fixture.cwd);

            await router.handle({ type: 'graph/branchCommand', command: 'push', branch: 'feature/push', isRemote: false });
            expect(remote.gitTrim(['rev-parse', 'refs/heads/feature/push'])).toBe(fixture.gitTrim(['rev-parse', 'feature/push']));

            setWarningChoice('Delete Remote');
            await router.handle({ type: 'graph/branchCommand', command: 'delete', branch: 'origin/feature/push', isRemote: true });
            expect(remote.gitTrim(['branch', '--list', 'feature/push'])).toBe('');
        } finally {
            remote.cleanup();
        }
    });

    it('checks out remote branches by creating or reusing local tracking branches', async () => {
        const remote = createBareGitRepo();
        const messages: GraphExtensionToWebviewMessage[] = [];
        try {
            const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            const remoteHead = createRemoteOnlyBranch(fixture, 'feature/remote-checkout', base, 'remote-checkout.txt', 'remote checkout\n', 'feat(graph): add remote checkout branch');
            const router = routerFor(fixture.cwd, messages);

            await router.handle({ type: 'graph/branchCommand', command: 'checkout', branch: 'origin/feature/remote-checkout', isRemote: true });
            expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/remote-checkout');
            expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(remoteHead);
            expect(fixture.gitTrim(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).toBe('origin/feature/remote-checkout');

            fixture.git(['checkout', '-q', 'main']);
            await router.handle({ type: 'graph/branchCommand', command: 'checkout', branch: 'origin/feature/remote-checkout', isRemote: true });
            expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/remote-checkout');
            expect(messages.find((message) => message.type === 'graph/error')).toBeUndefined();
        } finally {
            remote.cleanup();
        }
    });

    it('creates local branches and worktrees from remote branches', async () => {
        const remote = createBareGitRepo();
        try {
            const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            const remoteHead = createRemoteOnlyBranch(fixture, 'feature/remote-source', base, 'remote-source.txt', 'remote source\n', 'feat(graph): add remote branch source');
            const router = routerFor(fixture.cwd);

            setInputBoxValue('feature/from-remote');
            await router.handle({ type: 'graph/branchCommand', command: 'newBranchFrom', branch: 'origin/feature/remote-source', isRemote: true });
            expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/from-remote');
            expect(fixture.gitTrim(['rev-parse', 'feature/from-remote'])).toBe(remoteHead);
        } finally {
            remote.cleanup();
        }
    });

    it('rebases and merges branches against selected remote branches', async () => {
        const remote = createBareGitRepo();
        const messages: GraphExtensionToWebviewMessage[] = [];
        try {
            const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            const remoteRebaseHead = createRemoteOnlyBranch(fixture, 'feature/remote-rebase', base, 'remote-rebase.txt', 'remote rebase\n', 'feat(graph): add remote rebase branch');
            const remoteMergeHead = createRemoteOnlyBranch(fixture, 'feature/remote-merge', base, 'remote-merge.txt', 'remote merge\n', 'feat(graph): add remote merge branch');
            fixture.git(['checkout', '-q', 'main']);
            const mainHead = fixture.commitFile('main.txt', 'main\n', 'feat(graph): add main branch work');
            const router = routerFor(fixture.cwd, messages);

            await router.handle({ type: 'graph/branchCommand', command: 'checkoutRebaseOnto', branch: 'origin/feature/remote-rebase', isRemote: true });
            expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/remote-rebase');
            expect(fixture.gitTrim(['merge-base', 'HEAD', 'main'])).toBe(mainHead);
            expect(fixture.gitTrim(['show', 'HEAD:remote-rebase.txt'])).toBe('remote rebase');
            expect(fixture.gitTrim(['rev-parse', 'origin/feature/remote-rebase'])).toBe(remoteRebaseHead);

            fixture.git(['checkout', '-q', 'main']);
            fixture.git(['checkout', '-q', '-b', 'feature/local-rebase-topic', base]);
            fixture.commitFile('topic.txt', 'topic\n', 'feat(graph): add local rebase topic');
            await router.handle({ type: 'graph/branchCommand', command: 'rebaseOnto', branch: 'origin/feature/remote-merge', isRemote: true });
            expect(fixture.gitTrim(['branch', '--show-current'])).toBe('feature/local-rebase-topic');
            expect(fixture.gitTrim(['merge-base', 'HEAD', 'origin/feature/remote-merge'])).toBe(remoteMergeHead);

            fixture.git(['checkout', '-q', 'main']);
            await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'origin/feature/remote-merge', isRemote: true });
            expect(fixture.gitTrim(['show', 'HEAD:remote-merge.txt'])).toBe('remote merge');
            expect(fixture.gitTrim(['log', '-1', '--format=%P']).split(' ')).toHaveLength(2);
            expect(messages.find((message) => message.type === 'graph/error')).toBeUndefined();
        } finally {
            remote.cleanup();
        }
    });

    it('opens compare and working tree diffs against remote branches', async () => {
        const remote = createBareGitRepo();
        try {
            const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            createRemoteOnlyBranch(fixture, 'feature/remote-diff', base, 'remote-diff.txt', 'remote diff\n', 'feat(graph): add remote diff branch');
            fixture.write('base.txt', 'working tree\n');
            const router = routerFor(fixture.cwd);

            await router.handle({ type: 'graph/branchCommand', command: 'compareWithCurrent', branch: 'origin/feature/remote-diff', isRemote: true });
            await router.handle({ type: 'graph/branchCommand', command: 'showDiffWithWorkingTree', branch: 'origin/feature/remote-diff', isRemote: true });

            expect(workspace.documents[0]?.content).toContain('remote-diff.txt');
            expect(workspace.documents[1]?.content).toContain('working tree');
        } finally {
            remote.cleanup();
        }
    });
});

function createRemoteOnlyBranch(fixture: TempGitRepo, branch: string, startPoint: string, filePath: string, content: string, message: string): string {
    fixture.git(['checkout', '-q', '-b', branch, startPoint]);
    const head = fixture.commitFile(filePath, content, message);
    fixture.git(['push', '-q', 'origin', `${branch}:${branch}`]);
    fixture.git(['checkout', '-q', 'main']);
    fixture.git(['branch', '-D', branch]);
    fixture.git(['fetch', '-q', 'origin']);
    return head;
}

function routerFor(cwd: string, messages: GraphExtensionToWebviewMessage[] = []): GraphMessageRouter {
    const repo = new GitProcessRepository(cwd);
    return new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });
}
