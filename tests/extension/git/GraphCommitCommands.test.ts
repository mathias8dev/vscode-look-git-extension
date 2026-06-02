import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GitProcessRepository } from '../../../src/extension/git/GitProcessRepository';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import type { GraphExtensionToWebviewMessage } from '../../../src/protocol/graph/messages';
import { makeRepositoryAccessor } from '../../helpers/repositoryMock';
import { createBareGitRepo, createTempGitRepo, type TempGitRepo } from '../../helpers/gitRepo';
import { resetMockVscode, setInputBoxValue, setWarningChoice } from '../../mocks/vscode';

describe('Graph commit commands against real git repos', () => {
    let fixture: TempGitRepo;

    beforeEach(() => {
        resetMockVscode();
        fixture = createTempGitRepo();
    });

    afterEach(() => {
        fixture.cleanup();
    });

    it('creates branches and tags at selected revisions', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        const router = routerFor(fixture.cwd);

        setInputBoxValue('branch-at-base');
        await router.handle({ type: 'graph/commitCommand', command: 'newBranch', hash: base, hashes: [base] });
        setInputBoxValue('tag-at-head');
        await router.handle({ type: 'graph/commitCommand', command: 'newTag', hash: head, hashes: [head] });

        expect(fixture.gitTrim(['rev-parse', 'branch-at-base'])).toBe(base);
        expect(fixture.gitTrim(['rev-parse', 'tag-at-head'])).toBe(head);
    });

    it('cherry-picks multi-selected commits in chronological order', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature']);
        const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
        const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
        fixture.git(['checkout', '-q', 'main']);
        fixture.git(['reset', '--hard', base]);
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: newer, hashes: [newer, older] });

        expect(fixture.gitTrim(['log', '--format=%s', '-2']).split('\n')).toEqual(['feat: newer', 'feat: older']);
        expect(fixture.gitTrim(['show', 'HEAD:newer.txt'])).toBe('newer');
        expect(fixture.gitTrim(['show', 'HEAD~1:older.txt'])).toBe('older');
    });

    it('cherry-picks commits that are only reachable from a remote branch', async () => {
        const remote = createBareGitRepo();
        try {
            const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
            fixture.git(['remote', 'add', 'origin', remote.cwd]);
            fixture.git(['push', '-u', 'origin', 'main']);
            fixture.git(['checkout', '-q', '-b', 'feature/remote-cherry', base]);
            const older = fixture.commitFile('remote-older.txt', 'older\n', 'feat(graph): add older remote cherry commit');
            const newer = fixture.commitFile('remote-newer.txt', 'newer\n', 'feat(graph): add newer remote cherry commit');
            fixture.git(['push', '-q', 'origin', 'feature/remote-cherry:feature/remote-cherry']);
            fixture.git(['checkout', '-q', 'main']);
            fixture.git(['branch', '-D', 'feature/remote-cherry']);
            fixture.git(['fetch', '-q', 'origin']);
            fixture.git(['reset', '--hard', base]);
            const router = routerFor(fixture.cwd);

            await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: newer, hashes: [newer, older] });

            expect(fixture.gitTrim(['log', '--format=%s', '-2']).split('\n')).toEqual([
                'feat(graph): add newer remote cherry commit',
                'feat(graph): add older remote cherry commit',
            ]);
            expect(fixture.gitTrim(['show', 'HEAD:remote-newer.txt'])).toBe('newer');
            expect(fixture.gitTrim(['show', 'HEAD~1:remote-older.txt'])).toBe('older');
            expect(fixture.gitTrim(['branch', '--list', 'feature/remote-cherry'])).toBe('');
        } finally {
            remote.cleanup();
        }
    });

    it('edits an older commit message and replays descendants', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        fixture.write('local.txt', 'local\n');
        const router = routerFor(fixture.cwd);

        setInputBoxValue('fix: edited base');
        await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: base, hashes: [base] });

        expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('fix: edited base\nfeat: head');
        expect(fixture.gitTrim(['show', 'HEAD:head.txt'])).toBe('head');
        expect(fixture.gitTrim(['rev-parse', 'HEAD'])).not.toBe(head);
        expect(fixture.gitTrim(['status', '--short'])).toBe('?? local.txt');
    });

    it('edits a commit on a non-current local branch', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature']);
        const feature = fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd);

        setInputBoxValue('fix: edited feature');
        await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: feature, hashes: [feature] });

        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('main');
        expect(fixture.gitTrim(['log', '-1', '--format=%s', 'feature'])).toBe('fix: edited feature');
        expect(fixture.gitTrim(['log', '-1', '--format=%s', 'main'])).toBe('feat: main');
        expect(fixture.gitTrim(['log', '--all', '--format=%H'])).not.toContain(feature);
    });

    it('rewrites every local branch containing the edited commit', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'feature']);
        fixture.commitFile('feature.txt', 'feature\n', 'feat: feature');
        fixture.git(['checkout', '-q', 'main']);
        fixture.commitFile('main.txt', 'main\n', 'feat: main');
        const router = routerFor(fixture.cwd);

        setInputBoxValue('fix: edited shared base');
        await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: base, hashes: [base] });

        expect(fixture.gitTrim(['branch', '--show-current'])).toBe('main');
        expect(fixture.gitTrim(['log', '--format=%s', '--reverse', 'main'])).toBe('fix: edited shared base\nfeat: main');
        expect(fixture.gitTrim(['log', '--format=%s', '--reverse', 'feature'])).toBe('fix: edited shared base\nfeat: feature');
        expect(fixture.gitTrim(['log', '--all', '--format=%H'])).not.toContain(base);
    });

    it('edits the head message without including staged changes', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        fixture.write('staged.txt', 'staged\n');
        fixture.git(['add', 'staged.txt']);
        const router = routerFor(fixture.cwd);

        setInputBoxValue('fix: edited head');
        await router.handle({ type: 'graph/commitCommand', command: 'editCommitMessage', hash: head, hashes: [head] });

        expect(fixture.gitTrim(['log', '-1', '--format=%s'])).toBe('fix: edited head');
        expect(fixture.gitTrim(['status', '--short'])).toBe('A  staged.txt');
    });

    it('fixes up staged changes into the selected commit', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.commitFile('head.txt', 'head\n', 'feat: head');
        fixture.write('fixup.txt', 'fixup\n');
        fixture.git(['add', 'fixup.txt']);
        const router = routerFor(fixture.cwd);

        await router.handle({ type: 'graph/commitCommand', command: 'fixup', hash: base, hashes: [base] });

        expect(fixture.gitTrim(['rev-list', '--count', 'HEAD'])).toBe('2');
        expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: base\nfeat: head');
        expect(fixture.gitTrim(['show', 'HEAD~1:fixup.txt'])).toBe('fixup');
    });

    it('squashes staged changes into the selected commit with both messages', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        fixture.commitFile('head.txt', 'head\n', 'feat: head');
        fixture.write('squash.txt', 'squash\n');
        fixture.git(['add', 'squash.txt']);
        const router = routerFor(fixture.cwd);

        setInputBoxValue('fix: staged squash');
        await router.handle({ type: 'graph/commitCommand', command: 'squashInto', hash: base, hashes: [base] });

        expect(fixture.gitTrim(['rev-list', '--count', 'HEAD'])).toBe('2');
        expect(fixture.gitTrim(['log', '--format=%B', '--reverse'])).toContain('feat: base\n\nfix: staged squash');
        expect(fixture.gitTrim(['show', 'HEAD~1:squash.txt'])).toBe('squash');
    });

    it('drops multiple selected commits without depending on selection order', async () => {
        fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const older = fixture.commitFile('older.txt', 'older\n', 'feat: older');
        const newer = fixture.commitFile('newer.txt', 'newer\n', 'feat: newer');
        fixture.commitFile('tail.txt', 'tail\n', 'feat: tail');
        const router = routerFor(fixture.cwd);

        setWarningChoice('Drop');
        await router.handle({ type: 'graph/commitCommand', command: 'dropCommit', hash: older, hashes: [older, newer] });

        expect(fixture.gitTrim(['log', '--format=%s', '--reverse'])).toBe('feat: base\nfeat: tail');
        expect(() => fixture.gitTrim(['show', 'HEAD:older.txt'])).toThrow();
        expect(() => fixture.gitTrim(['show', 'HEAD:newer.txt'])).toThrow();
        expect(fixture.gitTrim(['show', 'HEAD:tail.txt'])).toBe('tail');
    });

    it('drops commits while preserving unstaged local changes', async () => {
        const base = fixture.commitFile('base.txt', 'base\n', 'feat: base');
        const head = fixture.commitFile('head.txt', 'head\n', 'feat: head');
        fixture.write('local.txt', 'local\n');
        const router = routerFor(fixture.cwd);

        setWarningChoice('Drop');
        await router.handle({ type: 'graph/commitCommand', command: 'dropCommit', hash: head, hashes: [head] });

        expect(fixture.gitTrim(['rev-parse', 'HEAD'])).toBe(base);
        expect(fixture.gitTrim(['status', '--short'])).toBe('?? local.txt');
        expect(() => fixture.gitTrim(['show', 'HEAD:head.txt'])).toThrow();
    });

    it('reports a clear error before reverting with unresolved conflicts', async () => {
        fixture.commitFile('conflict.txt', 'base\n', 'feat: base');
        fixture.git(['checkout', '-q', '-b', 'incoming']);
        fixture.commitFile('conflict.txt', 'incoming\n', 'feat: incoming');
        fixture.git(['checkout', '-q', 'main']);
        const main = fixture.commitFile('conflict.txt', 'main\n', 'feat: main');
        expect(() => fixture.git(['merge', 'incoming'])).toThrow();
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = routerFor(fixture.cwd, messages);

        await router.handle({ type: 'graph/commitCommand', command: 'revertCommit', hash: main, hashes: [main] });

        const error = messages.find((message) => message.type === 'graph/error');
        expect(error?.message).toBe('Resolve existing merge/rebase conflicts before reverting commits.');
        expect(fixture.gitTrim(['status', '--short'])).toContain('UU conflict.txt');
    });
});

function routerFor(cwd: string, messages: GraphExtensionToWebviewMessage[] = []): GraphMessageRouter {
    const repo = new GitProcessRepository(cwd);
    return new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });
}
