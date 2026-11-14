import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComparisonMessageRouter } from '@extension/messaging/comparison-message-router';
import { ComparisonMode } from '@protocol/comparison/types';
import type { ComparisonRequest, ComparisonResponse } from '@protocol/comparison/messages';
import { createComparisonFixture } from '@tests/helpers/comparison-fixture';
import { commands, resetMockVscode } from '@tests/mocks/vscode';
import type { GitBranch } from '@core/git/domain/git-status';

describe('ComparisonMessageRouter', () => {
    const cleanups: (() => void)[] = [];
    afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); resetMockVscode(); });
    const setup = () => {
        const fixture = createComparisonFixture(); cleanups.push(() => fixture.repo.cleanup());
        const messages: ComparisonResponse[] = [];
        const router = new ComparisonMessageRouter(fixture.repository, { postMessage: message => messages.push(message) }, 'main', 'feature');
        cleanups.push(() => router.dispose());
        const request: ComparisonRequest = { type: 'comparison/dataRequest', requestId: 'compare', baseBranch: 'main', headBranch: 'feature', mode: ComparisonMode.SinceDivergence };
        return { ...fixture, router, messages, request };
    };
    const snapshotFrom = (messages: readonly ComparisonResponse[]) => {
        const response = messages.find(message => message.type === 'comparison/dataResponse');
        if (!response || response.type !== 'comparison/dataResponse') throw new Error('Expected comparison data');
        return response.snapshot;
    };

    it('returns commit details and opens native diffs against the pinned revisions', async () => {
        const { router, request, messages, feature } = setup();
        await router.handle(request);
        const snapshot = snapshotFrom(messages);
        await router.handle({ type: 'comparison/detailsRequest', requestId: 'details', snapshotId: snapshot.id, hash: feature, search: '' });
        const details = messages.find(message => message.type === 'comparison/detailsResponse');
        expect(details).toEqual(expect.objectContaining({ details: expect.objectContaining({ fullMessage: expect.stringContaining('Full commit body for review.'), files: expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ filePath: 'src/renamed.ts' })]) }) }) }));
        await router.handle({ type: 'comparison/openDiff', requestId: 'open', snapshotId: snapshot.id, filePath: 'src/renamed.ts' });
        expect(messages.at(-1)).toEqual({ type: 'comparison/opened', requestId: 'open' });
        const native = commands.calls.at(-1);
        expect(native?.command).toBe('vscode.diff');
        expect(native?.args[0]).toEqual(expect.objectContaining({ scheme: 'lookgit-blob', path: expect.stringContaining('src/original.ts') }));
        expect(native?.args[1]).toEqual(expect.objectContaining({ scheme: 'lookgit-blob', path: expect.stringContaining('src/renamed.ts') }));
        expect(() => JSON.stringify(messages)).not.toThrow();
    });

    it('paginates and searches comparison files and selected commit files', async () => {
        const { router, request, messages, repo } = setup();
        repo.git(['checkout', '-q', 'feature']);
        for (let i = 0; i < 105; i++) repo.write(`many/file-${String(i).padStart(3, '0')}.ts`, `${i}\n`);
        const hash = repo.commit('Many files\n\nLong body.'); repo.git(['checkout', '-q', 'main']);
        await router.handle(request);
        const snapshot = snapshotFrom(messages);
        expect(snapshot.files.items).toHaveLength(100); expect(snapshot.files.hasMore).toBe(true);
        await router.handle({ type: 'comparison/filesRequest', requestId: 'more', snapshotId: snapshot.id, search: '', cursor: snapshot.files.cursor });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ type: 'comparison/filesResponse', files: expect.objectContaining({ hasMore: false, items: expect.any(Array) }) }));
        await router.handle({ type: 'comparison/detailsRequest', requestId: 'details', snapshotId: snapshot.id, hash, search: '' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ details: expect.objectContaining({ files: expect.objectContaining({ hasMore: true, totalCount: 105 }) }) }));
        await router.handle({ type: 'comparison/detailsRequest', requestId: 'filtered', snapshotId: snapshot.id, hash, search: 'file-104' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ details: expect.objectContaining({ fullMessage: expect.stringContaining('Long body.'), files: expect.objectContaining({ totalCount: 1, hasMore: false, items: [expect.objectContaining({ filePath: 'many/file-104.ts' })] }) }) }));
    });

    it('bounds and searches branch choices', async () => {
        const { router, repository, messages } = setup();
        const branches: GitBranch[] = Array.from({ length: 125 }, (_, index) => ({ name: `branch-${index}`, isRemote: false, isCurrent: index === 0, hash: 'a', ahead: 0, behind: 0 }));
        vi.spyOn(repository, 'listBranches').mockResolvedValue(branches);
        await router.handle({ type: 'comparison/ready', requestId: 'ready' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ branches: expect.objectContaining({ totalCount: 125, hasMore: true, items: expect.any(Array) }) }));
        const response = messages.at(-1); if (response?.type !== 'comparison/init') throw new Error('Expected init');
        expect(response.branches.items).toHaveLength(100);
        await router.handle({ type: 'comparison/branchesRequest', requestId: 'branches', search: 'branch-124' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ branches: expect.objectContaining({ totalCount: 1, items: [{ name: 'branch-124', ref: 'refs/heads/branch-124', isRemote: false }] }) }));
    });

    it('searches all commits in the pinned range, including commits beyond the initial page', async () => {
        const { router, request, messages, repo, feature } = setup();
        repo.git(['checkout', '-q', 'feature']);
        for (let index = 0; index < 52; index++) { repo.git(['commit', '--allow-empty', '-qm', `Later commit ${index}`]); }
        repo.git(['checkout', '-q', 'main']);
        await router.handle(request);
        const snapshot = snapshotFrom(messages);
        expect(snapshot.commits.items.some(commit => commit.hash === feature)).toBe(false);
        await router.handle({ type: 'comparison/commitsRequest', requestId: 'search', snapshotId: snapshot.id, search: 'FEATURE CHANGES' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ type: 'comparison/commitsResponse', commits: expect.objectContaining({
            items: [expect.objectContaining({ hash: feature })], hasMore: false, totalCount: 53,
        }) }));
        await router.handle({ type: 'comparison/detailsRequest', requestId: 'search-details', snapshotId: snapshot.id, hash: feature, search: '' });
        expect(messages.at(-1)?.type).toBe('comparison/detailsResponse');
        await router.handle({ type: 'comparison/commitsRequest', requestId: 'base', snapshotId: snapshot.id, search: snapshot.baseHash });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ commits: expect.objectContaining({ items: [] }) }));
    });

    it('marks moved branches stale while retaining the pinned comparison', async () => {
        const { router, request, messages, repo } = setup();
        await router.handle(request); const snapshot = snapshotFrom(messages);
        repo.commitFile('later.txt', 'later\n', 'Later');
        await router.checkStale();
        expect(messages.at(-1)).toEqual({ type: 'comparison/stale' });
        await router.handle({ type: 'comparison/filesRequest', requestId: 'pinned', snapshotId: snapshot.id, search: 'later' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ files: expect.objectContaining({ items: [], matchingCount: 0 }) }));
    });

    it('rejects expired snapshots, files and commits outside the comparison', async () => {
        const { router, request, messages } = setup();
        await router.handle(request); const snapshot = snapshotFrom(messages);
        await router.handle({ type: 'comparison/detailsRequest', requestId: 'bad-commit', snapshotId: snapshot.id, hash: snapshot.baseHash, search: '' });
        expect(messages.at(-1)?.type).toBe('comparison/error');
        await router.handle({ type: 'comparison/openDiff', requestId: 'bad-file', snapshotId: snapshot.id, filePath: '../private' });
        expect(messages.at(-1)?.type).toBe('comparison/error');
        await router.handle({ ...request, requestId: 'new' });
        await router.handle({ type: 'comparison/filesRequest', requestId: 'expired', snapshotId: snapshot.id, search: '' });
        expect(messages.at(-1)).toEqual(expect.objectContaining({ type: 'comparison/error', error: expect.objectContaining({ message: expect.stringContaining('expired') }) }));
    });

    it('resolves selected full refs even when a local short name looks like a remote ref', async () => {
        const { router, request, messages, repo, feature } = setup();
        repo.git(['branch', 'refs/remotes/team/topic', 'main']);
        repo.git(['update-ref', 'refs/remotes/team/topic', feature]);
        await router.handle({ ...request, headBranch: 'refs/remotes/team/topic' });
        expect(snapshotFrom(messages).headHash).toBe(feature);
    });

    it('aborts superseded comparisons and never posts their responses even if a dependency ignores abort', async () => {
        const { router, request, messages, repository } = setup();
        const branches = await repository.listBranches();
        let resolve: ((value: readonly GitBranch[]) => void) | undefined;
        let oldSignal: AbortSignal | undefined;
        vi.spyOn(repository, 'listBranches').mockImplementationOnce(signal => { oldSignal = signal; return new Promise(done => { resolve = done; }); });
        const old = router.handle({ ...request, requestId: 'old' });
        await router.handle({ ...request, requestId: 'new' });
        expect(oldSignal?.aborted).toBe(true); resolve?.(branches); await old;
        expect(messages.some(message => 'requestId' in message && message.requestId === 'old')).toBe(false);
        expect(messages.some(message => 'requestId' in message && message.requestId === 'new')).toBe(true);
    });

    it('aborts on disposal without posting a response', async () => {
        const { router, request, messages, repository } = setup(); const branches = await repository.listBranches();
        let resolve: ((value: readonly GitBranch[]) => void) | undefined; let signal: AbortSignal | undefined;
        vi.spyOn(repository, 'listBranches').mockImplementationOnce(value => { signal = value; return new Promise(done => { resolve = done; }); });
        const pending = router.handle(request); router.dispose(); resolve?.(branches); await pending;
        expect(signal?.aborted).toBe(true); expect(messages).toEqual([]);
    });
});
