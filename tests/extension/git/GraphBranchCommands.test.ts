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
});

function routerFor(cwd: string): GraphMessageRouter {
    const repo = new GitProcessRepository(cwd);
    const messages: GraphExtensionToWebviewMessage[] = [];
    return new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });
}
