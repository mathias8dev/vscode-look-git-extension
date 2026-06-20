import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Uri as VscodeUri } from 'vscode';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GitGraphCommit } from '../../../src/core/git/domain/GitCommit';
import type { GitSubmodule, GitWorktree } from '../../../src/core/git/domain/GitWorktree';
import { RepoKind, type RepoContext } from '../../../src/core/git/domain/RepoContext';
import { LOG_FIELD_SEP, LOG_RECORD_SEP } from '../../../src/core/parsing/parseLog';
import type { GitRepository } from '../../../src/application/ports/git-repository';
import type { GitRuntime } from '../../../src/application/ports/git-runtime';
import type { GitRepository as RuntimeRepository, Worktree } from '../../../src/application/ports/git-topology';
import { GetGraphDataUseCase, type GraphDataResult } from '../../../src/application/usecases/graph/get-graph-data';
import { GraphMessageRouter } from '../../../src/extension/messaging/GraphMessageRouter';
import { RepositoryRegistry } from '../../../src/extension/repositories/RepositoryRegistry';
import type { ActiveRepositoryAccessor } from '../../../src/extension/repositories/ActiveRepositoryRegistry';
import { registerReadonlyDiffDocumentProvider } from '../../../src/extension/utils/readonly-diff-documents';
import { GraphOperationCategory, GraphOperationStatus, type GraphDataResponse, type GraphExtensionToWebviewMessage, type GraphSubmodulesPush, type WorktreeDetailsResponse } from '../../../src/protocol/graph/messages';
import { SubmoduleStatus } from '../../../src/protocol/shared/repo';
import { makeRepositoryAccessor, makeRepositoryMock } from '../../helpers/repositoryMock';
import { commands, env, lm, resetMockVscode, setInputBoxValue, setInputBoxValues, setQuickPickValue, setWarningChoice, setWarningChoices, Uri, window, workspace } from '../../mocks/vscode';

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

    it('marks only commits outside the current branch history as cherry-pickable', async () => {
        const currentHash = '1111111111111111';
        const topicHash = '2222222222222222';
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [graphCommit(currentHash), graphCommit(topicHash)]),
            getAllBranches: vi.fn(async () => [{
                name: 'main',
                isRemote: false,
                isCurrent: true,
                hash: currentHash,
                ahead: 0,
                behind: 0,
            }]),
            execRaw: vi.fn(async () => `${topicHash}\n`),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-cherry-pickable',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        expect(graphDataResponse(messages, 'graph-cherry-pickable').data.commits).toEqual([
            expect.objectContaining({ hash: currentHash, canCherryPick: false }),
            expect.objectContaining({ hash: topicHash, canCherryPick: true }),
        ]);
        expect(repo.execRaw).toHaveBeenCalledWith(['rev-list', '--no-walk', currentHash, topicHash, '--not', 'HEAD'], expect.any(AbortSignal));
    });

    it('requests only the next graph page when loading more commits', async () => {
        const getGraphLog = vi.fn(async () => [graphCommit('next-page-commit')]);
        const repo = makeRepositoryMock({
            getGraphLog,
            getAllBranches: vi.fn(async () => []),
            getAllTags: vi.fn(async () => []),
            getUserName: vi.fn(async () => 'Ada'),
            listWorktrees: vi.fn(async () => []),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/loadMore',
            requestId: 'graph-load-more',
            repoId: 'repo',
            filters: {},
            page: { offset: 300, limit: 100 },
        });

        expect(getGraphLog).toHaveBeenCalledWith(101, undefined, undefined, {
            search: undefined,
            authors: undefined,
            dateFrom: undefined,
            dateTo: undefined,
            skip: 300,
        }, expect.any(AbortSignal));
        expect(graphDataResponse(messages, 'graph-load-more').data.loadedCount).toBe(301);
    });

    it('writes graph errors to the Look Git output channel and shows it on request', async () => {
        const error = Object.assign(new Error('fetch failed'), { stderr: 'fatal: Authentication failed' });
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => { throw error; }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-error-output',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });
        await router.handle({ type: 'graph/showOutput' });

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            requestId: 'graph-error-output',
            error: expect.objectContaining({
                details: 'fatal: Authentication failed',
            }),
        }));
        expect(window.outputChannels.at(-1)).toEqual(expect.objectContaining({
            name: 'Look Git',
            shown: true,
        }));
        expect(window.outputChannels.at(-1)?.lines.join('\n')).toContain('fatal: Authentication failed');
    });

    it('returns graph data before hydrating submodule branch and worktree summaries', async () => {
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [graphCommit('abc1234567890abcdef')]),
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', '+')]),
            exec: vi.fn(async (args) => args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD' ? 'feature/oauth' : ''),
            execRaw: vi.fn(async (args) => {
                if (args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'for-each-ref') {
                    return [
                        'refs/heads/feature/oauth\0branch-head\0\0',
                        'refs/remotes/origin/main\0remote-head\0\0',
                    ].join('\n');
                }
                if (args.join(' ') === '-C modules/auth-kit worktree list --porcelain') {
                    return [
                        'worktree /repo/modules/auth-kit',
                        'HEAD branch-head',
                        'branch refs/heads/feature/oauth',
                    ].join('\n');
                }
                return '';
            }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-submodules',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        expect(graphDataResponse(messages, 'graph-submodules').data.submodules).toEqual([{
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.OutOfSync,
            branches: [],
            worktrees: [],
        }]);

        await vi.waitFor(() => expect(graphSubmodulesPush(messages, 'repo').submodules).toEqual([{
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.OutOfSync,
            branches: [
                { name: 'feature/oauth', isRemote: false, isCurrent: true, hash: 'branch-head', upstream: undefined, ahead: undefined, behind: undefined },
                { name: 'origin/main', isRemote: true, isCurrent: false, hash: 'remote-head', upstream: undefined, ahead: undefined, behind: undefined },
            ],
            worktrees: [{
                path: '/repo/modules/auth-kit',
                head: 'branch-head',
                branch: 'refs/heads/feature/oauth',
                isMain: true,
                isDetached: false,
                isLocked: false,
                lockReason: undefined,
            }],
        }]));
    });

    it('does not block the graph response on slow submodule branch queries', async () => {
        let resolveSubmoduleBranches: ((output: string) => void) | undefined;
        const repo = makeRepositoryMock({
            getGraphLog: vi.fn(async () => [graphCommit('abc1234567890abcdef')]),
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', '+')]),
            exec: vi.fn(async (args) => args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD' ? 'feature/oauth' : ''),
            execRaw: vi.fn(async (args) => {
                if (args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'for-each-ref') {
                    return new Promise<string>((resolve) => { resolveSubmoduleBranches = resolve; });
                }
                if (args.join(' ') === '-C modules/auth-kit worktree list --porcelain') {
                    return '';
                }
                return '';
            }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-slow-submodules',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
        });

        expect(graphDataResponse(messages, 'graph-slow-submodules').data.submodules).toEqual([{
            path: 'modules/auth-kit',
            name: 'auth-kit',
            status: SubmoduleStatus.OutOfSync,
            branches: [],
            worktrees: [],
        }]);
        expect(messages.some((message) => message.type === 'graph/submodulesPush')).toBe(false);

        resolveSubmoduleBranches?.('refs/heads/feature/oauth\0branch-head\0\0');

        await vi.waitFor(() => expect(graphSubmodulesPush(messages, 'repo').submodules[0]?.branches).toEqual([
            { name: 'feature/oauth', isRemote: false, isCurrent: true, hash: 'branch-head', upstream: undefined, ahead: undefined, behind: undefined },
        ]));
    });

    it('loads graph data in the selected submodule repository scope', async () => {
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
            exec: vi.fn(async (args) => {
                if (args.join(' ') === '-C modules/auth-kit rev-parse --abbrev-ref HEAD') { return 'feature/oauth'; }
                if (args.join(' ') === '-C modules/auth-kit config user.name') { return 'Submodule User'; }
                return '';
            }),
            execRaw: vi.fn(async (args) => {
                if (args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'log') {
                    return graphLogRecord('submodule-head', 'feat(auth): support scoped graph');
                }
                if (args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'for-each-ref') {
                    return 'refs/heads/feature/oauth\0submodule-head\0\0';
                }
                return '';
            }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/dataRequest',
            requestId: 'graph-submodule-scope',
            repoId: 'repo',
            filters: { branches: ['feature/oauth'] },
            page: { offset: 0, limit: 50 },
            repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        });

        const response = graphDataResponse(messages, 'graph-submodule-scope');
        expect(response.data.repositoryScope).toEqual({ kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' });
        expect(response.data.currentBranch).toBe('feature/oauth');
        expect(response.data.currentUser).toBe('Submodule User');
        expect(response.data.commits).toEqual([expect.objectContaining({
            hash: 'submodule-head',
            message: 'feat(auth): support scoped graph',
        })]);
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(expect.arrayContaining(['-C', 'modules/auth-kit', 'log', expect.stringContaining('--max-count=')]), expect.any(AbortSignal));
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(expect.arrayContaining(['-C', 'modules/auth-kit', 'for-each-ref']), expect.any(AbortSignal));
    });

    it('keeps concurrent graph data requests isolated by repository scope', async () => {
        const pending: CapturedGraphRequest[] = [];
        const getGraphData = new CapturingGraphDataUseCase(pending);
        const repo = makeRepositoryMock({
            cwd: '/workspace',
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(
            makeRepositoryAccessor(repo),
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            getGraphData,
        );

        const mainRequest = router.handle({
            type: 'graph/dataRequest',
            requestId: 'main-request',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
            repositoryScope: { kind: 'main' },
        });
        await vi.waitFor(() => expect(pending).toHaveLength(1));

        const submoduleRequest = router.handle({
            type: 'graph/dataRequest',
            requestId: 'submodule-request',
            repoId: 'repo',
            filters: {},
            page: { offset: 0, limit: 50 },
            repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        });
        await vi.waitFor(() => expect(pending).toHaveLength(2));

        pending[0]?.resolve();
        pending[1]?.resolve();
        await Promise.all([mainRequest, submoduleRequest]);

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'main-request',
            data: expect.objectContaining({
                repositoryScope: { kind: 'main' },
                currentBranch: 'main',
            }),
        }));
        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/dataResponse',
            requestId: 'submodule-request',
            data: expect.objectContaining({
                repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
                currentBranch: 'feature/oauth',
            }),
        }));
        expect(pending[0]?.signal?.aborted).toBe(false);
        expect(pending[1]?.signal?.aborted).toBe(false);
    });

    it('loads commit details in the selected submodule repository scope', async () => {
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
            exec: vi.fn(async (args) => args.join(' ') === '-C modules/auth-kit log -1 --format=%B submodule-head'
                ? 'feat(auth): support scoped graph'
                : ''),
            execRaw: vi.fn(async (args) => {
                if (args.join(' ') === '-C modules/auth-kit rev-list --parents -n 1 submodule-head') { return 'submodule-head'; }
                if (args.includes('--name-status')) { return 'M\0src/auth.ts\0'; }
                return '';
            }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/commitDetailsRequest',
            requestId: 'submodule-commit-details',
            hash: 'submodule-head',
            repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        });

        expect(messages).toContainEqual({
            type: 'graph/commitDetailsResponse',
            requestId: 'submodule-commit-details',
            hash: 'submodule-head',
            fullMessage: 'feat(auth): support scoped graph',
            files: [{ status: 'M', filePath: 'src/auth.ts', origPath: undefined, parentHash: undefined }],
        });
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', 'modules/auth-kit', 'rev-list', '--parents', '-n', '1', 'submodule-head'], undefined);
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

    it('loads worktree detail files through the runtime worktree when registered', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            worktreeId: 'linked',
            path: '/repo/.worktrees/a',
            head: '1234567890abcdef',
            branch: 'feature/a',
            getStatus: vi.fn(async () => ({
                staged: [{ indexStatus: 'M', workTreeStatus: ' ', filePath: 'staged.ts' }],
                unstaged: [
                    { indexStatus: ' ', workTreeStatus: 'M', filePath: 'dirty.ts' },
                    { indexStatus: '?', workTreeStatus: '?', filePath: 'new.ts' },
                ],
                conflicts: [{ indexStatus: 'U', workTreeStatus: 'U', filePath: 'conflict.ts' }],
                conflictState: 'none',
            })),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            (message) => { messages.push(message); },
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        await router.handle({
            type: 'graph/worktreeDetailsRequest',
            requestId: 'runtime-worktree-details',
            path: '/repo/.worktrees/a',
        });

        const response = worktreeDetailsResponse(messages, 'runtime-worktree-details');
        expect(response).toMatchObject({
            path: '/repo/.worktrees/a',
            head: '1234567890abcdef',
            branch: 'feature/a',
        });
        expect(response.files).toEqual([
            { status: 'U', filePath: 'conflict.ts', origPath: undefined },
            { status: 'M', filePath: 'dirty.ts', origPath: undefined },
            { status: '?', filePath: 'new.ts', origPath: undefined },
            { status: 'M', filePath: 'staged.ts', origPath: undefined },
        ]);
        expect(runtimeWorktree.getStatus).toHaveBeenCalledOnce();
        expect(legacyExecRaw).not.toHaveBeenCalled();
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
        expect(String(call?.args[0])).toBe('lookgit-blob:/head-worktree-head/src/dirty.ts');
        expect(String(call?.args[1])).toBe('file:/repo/.worktrees/a/src/dirty.ts');
        expect(call?.args[2]).toBe('dirty.ts (a)');
        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'show', 'HEAD:src/dirty.ts']);
    });

    it('opens worktree file diffs through the runtime worktree matching the diff path', async () => {
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({ execRaw: legacyExecRaw });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            worktreeId: 'linked',
            path: '/repo/.worktrees/a',
            getFileAtRevision: vi.fn(async () => 'runtime head content\n'),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        await router.handle({
            type: 'graph/openWorktreeDiff',
            worktreePath: '/repo/.worktrees/a',
            filePath: 'src/dirty.ts',
            status: 'M',
        });

        expect(runtimeWorktree.getFileAtRevision).toHaveBeenCalledWith('src/dirty.ts', 'HEAD');
        expect(commands.calls).toHaveLength(1);
        expect(commands.calls[0]?.command).toBe('vscode.diff');
        expect(legacyExecRaw).not.toHaveBeenCalled();
    });

    it('marks worktree detail files that are submodule gitlinks', async () => {
        const head = '1234567890abcdef';
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [worktree('/repo/.worktrees/a', head, 'feature/a')]),
            execRaw: vi.fn(async (args: readonly string[]) => {
                if (args[2] === 'submodule') { return ` ${'1'.repeat(40)} modules/billing-core (heads/main)\n`; }
                return ' M modules/billing-core\0';
            }),
        });
        const messages: GraphExtensionToWebviewMessage[] = [];
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => { messages.push(message); });

        await router.handle({
            type: 'graph/worktreeDetailsRequest',
            requestId: 'worktree-submodule-details',
            path: '/repo/.worktrees/a',
        });

        expect(worktreeDetailsResponse(messages, 'worktree-submodule-details').files).toEqual([{
            status: 'M',
            filePath: 'modules/billing-core',
            origPath: undefined,
            isSubmodule: true,
        }]);
    });

    it('opens worktree submodule gitlink diffs as readonly diff output', async () => {
        const disposable = registerReadonlyDiffDocumentProvider();
        try {
            const repo = makeRepositoryMock({
                execRaw: vi.fn(async () => 'Submodule modules/billing-core 1111111..2222222:\n'),
            });
            const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

            await router.handle({
                type: 'graph/openWorktreeDiff',
                worktreePath: '/repo/.worktrees/a',
                filePath: 'modules/billing-core',
                status: 'M',
                isSubmodule: true,
            });

            expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['-C', '/repo/.worktrees/a', 'diff', '--submodule=short', 'HEAD', '--', 'modules/billing-core']);
            expect(commands.calls.some((call) => call.command === 'vscode.diff')).toBe(false);
            expect(workspace.documents.at(-1)?.uri?.scheme).toBe('lookgit-diff');
            expect(workspace.documents.at(-1)?.content).toContain('Submodule modules/billing-core');
        } finally {
            disposable.dispose();
        }
    });

    it('opens commit submodule gitlink diffs as readonly diff output', async () => {
        const disposable = registerReadonlyDiffDocumentProvider();
        try {
            const repo = makeRepositoryMock({
                execRaw: vi.fn(async () => 'Submodule modules/auth-kit 1111111..2222222:\n'),
            });
            const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

            await router.handle({
                type: 'graph/openDiff',
                filePath: 'modules/auth-kit',
                commitHash: 'abc123456789',
                status: 'M',
                parentHash: 'parent123456789',
                isSubmodule: true,
            });

            expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['diff', '--submodule=short', 'parent123456789', 'abc123456789', '--', 'modules/auth-kit']);
            expect(commands.calls.some((call) => call.command === 'vscode.diff')).toBe(false);
            expect(workspace.documents.at(-1)?.uri?.scheme).toBe('lookgit-diff');
            expect(workspace.documents.at(-1)?.content).toContain('Submodule modules/auth-kit');
        } finally {
            disposable.dispose();
        }
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

    it('uses runtime repository capabilities for worktree add and remove commands', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true },
                worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'),
            ]),
            getAllBranches: vi.fn(async () => [
                { name: 'main', isRemote: false, isCurrent: true, hash: 'main-head', ahead: 0, behind: 0 },
            ]),
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            addWorktree: vi.fn(async () => {}),
            removeWorktree: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktreeModel({ path: '/repo/.worktrees/a', worktreeId: 'a' }));
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );
        const worktreePath = missingPath('look-git-add-runtime-wt-');

        setInputBoxValues([worktreePath, 'feature/new']);
        await router.handle({ type: 'graph/worktreeCommand', command: 'add' });
        setWarningChoice('Remove');
        await router.handle({ type: 'graph/worktreeCommand', command: 'remove', path: '/repo/.worktrees/a' });

        expect(runtimeRepository.addWorktree).toHaveBeenCalledWith({
            path: worktreePath,
            branch: 'feature/new',
            createNew: true,
        });
        expect(runtimeRepository.removeWorktree).toHaveBeenCalledWith('/repo/.worktrees/a', false);
        expect(vi.mocked(repo.addWorktree)).not.toHaveBeenCalled();
        expect(vi.mocked(repo.removeWorktree)).not.toHaveBeenCalled();
    });

    it('uses runtime capabilities for selected worktree branch checkout commands', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const legacyGetAllBranches = vi.fn(async () => { throw new Error('legacy getAllBranches should not run'); });
        const repo = makeRepositoryMock({
            exec: legacyExec,
            getAllBranches: legacyGetAllBranches,
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            listBranches: vi.fn(async () => [
                { name: 'feature/a', isCurrent: false, hash: 'abc123', ahead: 0, behind: 0, isRemote: false },
                { name: 'origin/feature/a', isCurrent: false, hash: 'def456', ahead: 0, behind: 0, isRemote: true },
            ]),
        });
        const runtimeWorktree = runtimeWorktreeModel({
            path: '/repo/.worktrees/a',
            worktreeId: 'a',
            checkout: vi.fn(async () => {}),
            checkoutNewBranch: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        setInputBoxValue('feature/new');
        await router.handle({ type: 'graph/worktreeCommand', command: 'newBranch', path: '/repo/.worktrees/a' });
        setQuickPickValue('feature/a');
        await router.handle({ type: 'graph/worktreeCommand', command: 'checkoutBranch', path: '/repo/.worktrees/a' });

        expect(runtimeWorktree.checkoutNewBranch).toHaveBeenCalledWith('feature/new', undefined);
        expect(runtimeRepository.listBranches).toHaveBeenCalled();
        expect(runtimeWorktree.checkout).toHaveBeenCalledWith('feature/a', {});
        expect(legacyExec).not.toHaveBeenCalled();
        expect(legacyGetAllBranches).not.toHaveBeenCalled();
    });

    it('uses runtime capabilities for selected worktree commit and stash commands', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const legacyExecRaw = vi.fn(async () => { throw new Error('legacy execRaw should not run'); });
        const repo = makeRepositoryMock({
            exec: legacyExec,
            execRaw: legacyExecRaw,
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            path: '/repo/.worktrees/a',
            worktreeId: 'a',
            getStatus: vi.fn(async () => ({
                staged: [],
                unstaged: [{ indexStatus: ' ', workTreeStatus: 'M', filePath: 'src/dirty.ts' }],
                conflicts: [],
                conflictState: 'none',
            })),
            stageAll: vi.fn(async () => {}),
            commit: vi.fn(async () => {}),
            stash: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        setWarningChoice('Stage All and Commit');
        setInputBoxValue('feat: runtime worktree commit');
        await router.handle({ type: 'graph/worktreeCommand', command: 'commit', path: '/repo/.worktrees/a' });
        setInputBoxValue('wip: runtime worktree stash');
        await router.handle({ type: 'graph/worktreeCommand', command: 'stash', path: '/repo/.worktrees/a' });

        expect(runtimeWorktree.getStatus).toHaveBeenCalled();
        expect(runtimeWorktree.stageAll).toHaveBeenCalled();
        expect(runtimeWorktree.commit).toHaveBeenCalledWith('feat: runtime worktree commit', {});
        expect(runtimeWorktree.stash).toHaveBeenCalledWith('wip: runtime worktree stash', { includeUntracked: true });
        expect(legacyExec).not.toHaveBeenCalled();
        expect(legacyExecRaw).not.toHaveBeenCalled();
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
            execRaw: vi.fn(async (args) => args[0] === 'rev-list' ? 'a\nb\nc' : ''),
            exec: vi.fn(async (args) => {
                if (args[0] === 'rev-list') { return 'c\nb\na'; }
                return '';
            }),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: 'c', hashes: ['a', 'b', 'c'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['rev-list', '--no-walk', 'a', 'b', 'c', '--not', 'HEAD'], undefined);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['rev-list', '--topo-order', 'a', 'b', 'c']);
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['cherry-pick', 'a', 'b', 'c']);
    });

    it('rejects cherry-picking commits that are already in the current branch history', async () => {
        const messages: GraphExtensionToWebviewMessage[] = [];
        const repo = makeRepositoryMock({
            execRaw: vi.fn(async () => ''),
            exec: vi.fn(async (args) => {
                if (args[0] === 'rev-list') { return 'a'; }
                return '';
            }),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), (message) => messages.push(message));

        await router.handle({ type: 'graph/commitCommand', command: 'cherryPick', hash: 'a', hashes: ['a'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenCalledWith(['rev-list', '--no-walk', 'a', '--not', 'HEAD'], undefined);
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['cherry-pick', 'a']);
        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/error',
            message: 'Cherry-pick is only available for commits outside the current branch history: a.',
        }));
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

    it('uses runtime repository capabilities for worktrees created from commits', async () => {
        const repo = makeRepositoryMock();
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            addWorktree: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktreeModel({}));
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );
        const worktreePath = missingPath('look-git-commit-runtime-wt-');

        setInputBoxValues([worktreePath, 'feature/from-commit']);
        await router.handle({ type: 'graph/commitCommand', command: 'newWorktreeFromCommit', hash: 'abc123', hashes: ['abc123'] });

        expect(runtimeRepository.addWorktree).toHaveBeenCalledWith({
            path: worktreePath,
            branch: 'feature/from-commit',
            createNew: true,
            startPoint: 'abc123',
        });
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['worktree', 'add', '-b', 'feature/from-commit', worktreePath, 'abc123']);
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

    it('opens visual rebase for interactive rebase from a commit', async () => {
        const repo = makeRepositoryMock({
            cwd: '/repo',
            getLogForRef: vi.fn(async () => [graphCommit('def4567890abcdef'), graphCommit('abc1234567890abc')]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined, async () => {}, undefined, undefined, undefined, undefined, testUri('/ext'), testUri('/tmp'));

        await router.handle({ type: 'graph/commitCommand', command: 'interactiveRebaseFromHere', hash: 'abc123', hashes: ['abc123'] });

        expect(window.terminals).toEqual([]);
        expect(window.webviewPanels).toHaveLength(1);
        const panel = window.webviewPanels[0];
        expect(panel).toEqual(expect.objectContaining({
            viewType: 'lookGit.visualRebase',
            title: 'Visual Rebase from abc123',
        }));
        panel?.webview.messageHandler?.({ type: 'visualRebase/ready' });

        expect(panel?.webview.messages).toContainEqual(expect.objectContaining({
            type: 'visualRebase/init',
            currentBranch: 'main',
            upstream: 'abc123',
            commits: expect.arrayContaining([
                expect.objectContaining({ hash: 'abc1234567890abc', action: 'pick' }),
                expect.objectContaining({ hash: 'def4567890abcdef', action: 'pick' }),
            ]),
        }));

        panel?.webview.messageHandler?.({
            type: 'visualRebase/start',
            plan: [
                { hash: 'abc1234567890abc', action: 'pick', message: 'feat: first' },
                { hash: 'def4567890abcdef', action: 'drop', message: 'fix: second' },
            ],
        });

        await vi.waitFor(() => expect(vi.mocked(repo.execWithEnv)).toHaveBeenCalledWith(
            ['rebase', '--autostash', '-i', 'abc123', 'main'],
            expect.objectContaining({
                GIT_SEQUENCE_EDITOR: expect.stringContaining('sequence-editor.cjs'),
                GIT_EDITOR: expect.stringContaining('message-editor.cjs'),
                LOOK_GIT_REBASE_MESSAGES: expect.stringContaining('messages.json'),
            }),
        ));
        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith([
            'update-ref',
            expect.stringMatching(/^refs\/look-git\/backup\/main-/),
            'HEAD',
        ]);
        expect(panel?.webview.messages).toContainEqual(expect.objectContaining({
            type: 'visualRebase/completed',
            backupRef: expect.stringMatching(/^refs\/look-git\/backup\/main-/),
        }));
    });

    it('supports keep reset mode for reset-to-revision', async () => {
        const repo = makeRepositoryMock();
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Keep reset');
        await router.handle({ type: 'graph/commitCommand', command: 'resetCurrentBranchToHere', hash: 'abc123', hashes: ['abc123'] });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['reset', '--keep', 'abc123']);
    });

    it('uses runtime worktree capabilities for active main commit reset commands', async () => {
        const repo = makeRepositoryMock();
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            resetSoft: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        setQuickPickValue('Soft reset');
        await router.handle({ type: 'graph/commitCommand', command: 'resetCurrentBranchToHere', hash: 'abc123', hashes: ['abc123'] });

        expect(runtimeWorktree.resetSoft).toHaveBeenCalledWith('abc123');
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['reset', '--soft', 'abc123']);
    });

    it('uses runtime worktree capabilities for active main single commit revert commands', async () => {
        const repo = makeRepositoryMock();
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            revertCommit: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'graph/commitCommand', command: 'revertCommit', hash: 'abc123', hashes: ['abc123'] });

        expect(runtimeWorktree.revertCommit).toHaveBeenCalledWith('abc123', { noEdit: true });
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['revert', '--no-edit', 'abc123']);
    });

    it('writes a patch file for the selected commits', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'rev-list' ? 'b\na' : ''),
            execRaw: vi.fn(async (args) => `patch ${args.at(-1)}\n`),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);
        const patchPath = path.join(os.tmpdir(), 'look-git-router.patch');
        setQuickPickValue('Save Patch to File...');
        window.saveDialogValue = Uri.file(patchPath);

        await router.handle({ type: 'graph/commitCommand', command: 'createPatch', hash: 'b', hashes: ['a', 'b'] });

        expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(1, ['format-patch', '-1', '--stdout', 'a']);
        expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(2, ['format-patch', '-1', '--stdout', 'b']);
        expect(window.infoMessages).toContain(`Patch saved to ${patchPath}.`);
    });

    it('copies a patch for the selected commits', async () => {
        const repo = makeRepositoryMock({
            exec: vi.fn(async (args) => args[0] === 'rev-list' ? 'b\na' : ''),
            execRaw: vi.fn(async (args) => `patch ${args.at(-1)}\n`),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setQuickPickValue('Copy Patch to Clipboard');
        await router.handle({ type: 'graph/commitCommand', command: 'createPatch', hash: 'b', hashes: ['a', 'b'] });

        expect(env.clipboard.value).toBe('patch a\n\npatch b\n');
        expect(window.infoMessages).toContain('Patch copied to clipboard.');
    });

    it('explains selected commit diffs in a readonly markdown document', async () => {
        const disposable = registerReadonlyDiffDocumentProvider();
        try {
            lm.setResponse('Commit diff explained.');
            const repo = makeRepositoryMock({
                exec: vi.fn(async (args) => args[0] === 'rev-list' ? 'b\na' : ''),
                execRaw: vi.fn(async (args) => `commit ${args.at(-1)}\n`),
            });
            const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

            await router.handle({ type: 'graph/commitCommand', command: 'explainDiff', hash: 'b', hashes: ['a', 'b'] });

            expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(1, [
                'show',
                '--format=fuller',
                '--find-renames',
                '--find-copies',
                '--unified=3',
                '--stat',
                '--patch',
                'a',
            ], expect.any(AbortSignal));
            expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(2, [
                'show',
                '--format=fuller',
                '--find-renames',
                '--find-copies',
                '--unified=3',
                '--stat',
                '--patch',
                'b',
            ], expect.any(AbortSignal));
            expect(lm.requests[0]?.messages).toEqual([expect.objectContaining({
                content: expect.stringContaining('Selected commits:'),
            })]);
            const document = workspace.documents.at(-1);
            expect(document).toEqual(expect.objectContaining({
                uri: expect.objectContaining({ scheme: 'lookgit-diff' }),
                language: 'markdown',
                isDirty: false,
                content: expect.stringContaining('Commit diff explained.'),
            }));
            expect(window.shownDocuments).toHaveLength(1);
        } finally {
            disposable.dispose();
        }
    });

    it('explains selected commit diffs inside the selected submodule scope', async () => {
        const disposable = registerReadonlyDiffDocumentProvider();
        try {
            lm.setResponse('Submodule commit diff explained.');
            const repo = makeRepositoryMock({
                getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
                exec: vi.fn(async (args) => args[0] === '-C' && args[1] === 'modules/auth-kit' && args[2] === 'rev-list' ? 'sub-b\nsub-a' : ''),
                execRaw: vi.fn(async (args) => `submodule commit ${args.at(-1)}\n`),
            });
            const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

            await router.handle({
                type: 'graph/commitCommand',
                command: 'explainDiff',
                hash: 'sub-b',
                hashes: ['sub-a', 'sub-b'],
                repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
            });

            expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(1, [
                '-C',
                'modules/auth-kit',
                'show',
                '--format=fuller',
                '--find-renames',
                '--find-copies',
                '--unified=3',
                '--stat',
                '--patch',
                'sub-a',
            ], expect.any(AbortSignal));
            expect(vi.mocked(repo.execRaw)).toHaveBeenNthCalledWith(2, [
                '-C',
                'modules/auth-kit',
                'show',
                '--format=fuller',
                '--find-renames',
                '--find-copies',
                '--unified=3',
                '--stat',
                '--patch',
                'sub-b',
            ], expect.any(AbortSignal));
            expect(workspace.documents.at(-1)).toEqual(expect.objectContaining({
                content: expect.stringContaining('Submodule: `modules/auth-kit`'),
            }));
            expect(workspace.documents.at(-1)).toEqual(expect.objectContaining({
                content: expect.stringContaining('Submodule commit diff explained.'),
            }));
        } finally {
            disposable.dispose();
        }
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

    it('uses runtime capabilities for active main undo commit commands', async () => {
        const legacyExec = vi.fn(async () => { throw new Error('legacy exec should not run'); });
        const repo = makeRepositoryMock({ exec: legacyExec });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            resolveRef: vi.fn(async () => 'abc123'),
        });
        const runtimeWorktree = runtimeWorktreeModel({
            undoLastCommit: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        setWarningChoice('Undo Commit');
        await router.handle({ type: 'graph/commitCommand', command: 'undoCommit', hash: 'abc123', hashes: ['abc123'] });

        expect(runtimeRepository.resolveRef).toHaveBeenCalledWith('HEAD');
        expect(runtimeWorktree.undoLastCommit).toHaveBeenCalledWith('soft');
        expect(legacyExec).not.toHaveBeenCalled();
    });

    it('runs commit commands inside the selected submodule scope', async () => {
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        setInputBoxValue('feature/from-submodule-commit');
        await router.handle({
            type: 'graph/commitCommand',
            command: 'newBranch',
            hash: 'submodule-head',
            hashes: ['submodule-head'],
            repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', 'modules/auth-kit', 'branch', 'feature/from-submodule-commit', 'submodule-head'], undefined);
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

function testUri(value: string): VscodeUri {
    // The unit-test VS Code mock implements the Uri members used by this path.
    return Uri.file(value) as unknown as VscodeUri;
}

interface CapturedGraphRequest {
    readonly signal: AbortSignal | undefined;
    resolve(): void;
}

class CapturingGraphDataUseCase extends GetGraphDataUseCase {
    constructor(private readonly pending: CapturedGraphRequest[]) {
        super();
    }

    override execute(repo: GitRepository, _filters: Parameters<GetGraphDataUseCase['execute']>[1], _page: Parameters<GetGraphDataUseCase['execute']>[2], signal?: AbortSignal): Promise<GraphDataResult> {
        return captureGraphRequest(this.pending, repo, signal);
    }
}

function captureGraphRequest(
    pending: CapturedGraphRequest[],
    repo: GitRepository,
    signal: AbortSignal | undefined,
): Promise<GraphDataResult> {
    let resolveResult: ((value: GraphDataResult) => void) | undefined;
    let rejectResult: ((reason: unknown) => void) | undefined;
    const promise = new Promise<GraphDataResult>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
    });
    const abort = () => rejectResult?.(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    pending.push({
        signal,
        resolve() {
            signal?.removeEventListener('abort', abort);
            resolveResult?.(graphResultForRepo(repo.cwd));
        },
    });
    return promise;
}

function graphResultForRepo(cwd: string): GraphDataResult {
    const isSubmodule = cwd.replace(/\\/g, '/').endsWith('/modules/auth-kit');
    const branchName = isSubmodule ? 'feature/oauth' : 'main';
    const hash = isSubmodule ? 'submodule-head' : 'main-head';
    return {
        branches: [{ name: branchName, isRemote: false, isCurrent: true, hash, ahead: 0, behind: 0 }],
        tags: [],
        commits: [graphCommit(hash)],
        currentBranchCommitHashes: [hash],
        currentBranch: branchName,
        currentUser: isSubmodule ? 'Submodule User' : 'Main User',
        hasMore: false,
        loadedCount: 1,
        totalCount: 1,
        hasRemotes: false,
        worktrees: [],
        worktreeWips: [],
        submodules: [],
        warnings: [],
    };
}

function abortError(): Error {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}

function graphLogRecord(hash: string, message: string): string {
    return [
        hash,
        hash.substring(0, 7),
        message,
        'Submodule User',
        'submodule@example.com',
        '2024-01-01T00:00:00Z',
        '',
        'HEAD -> feature/oauth',
    ].join(LOG_FIELD_SEP) + LOG_RECORD_SEP;
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

function submodule(path: string, status: GitSubmodule['status']): GitSubmodule {
    return { path, status };
}

function graphDataResponse(messages: readonly GraphExtensionToWebviewMessage[], requestId: string): GraphDataResponse {
    const response = messages.find((message): message is GraphDataResponse => (
        message.type === 'graph/dataResponse' && message.requestId === requestId
    ));
    if (!response) { throw new Error(`Expected graph/dataResponse for ${requestId}.`); }
    return response;
}

function graphSubmodulesPush(messages: readonly GraphExtensionToWebviewMessage[], repoId: string): GraphSubmodulesPush {
    const response = messages.find((message): message is GraphSubmodulesPush => (
        message.type === 'graph/submodulesPush' && message.repoId === repoId
    ));
    if (!response) { throw new Error(`Expected graph/submodulesPush for ${repoId}.`); }
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
        expect(messages).toContainEqual({
            type: 'graph/operationStatus',
            operationId: 'graph-op-1',
            status: GraphOperationStatus.Running,
            category: GraphOperationCategory.Repository,
            command: 'fetch',
        });
        expect(messages).toContainEqual({
            type: 'graph/operationStatus',
            operationId: 'graph-op-1',
            status: GraphOperationStatus.Success,
            category: GraphOperationCategory.Repository,
            command: 'fetch',
        });
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

    it('uses runtime worktree capabilities for active main branch mutations', async () => {
        const legacyMerge = vi.fn(async () => { throw new Error('legacy merge should not run'); });
        const repo = makeRepositoryMock({ merge: legacyMerge });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeWorktree = runtimeWorktreeModel({
            merge: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepositoryModel({}));
        runtimeRegistry.registerWorktree(runtimeWorktree);
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        await router.handle({ type: 'graph/branchCommand', command: 'mergeInto', branch: 'feature/runtime', isRemote: false });

        expect(runtimeWorktree.merge).toHaveBeenCalledWith('feature/runtime', {});
        expect(legacyMerge).not.toHaveBeenCalled();
    });

    it('runs branch commands inside the selected submodule scope', async () => {
        const repo = makeRepositoryMock({
            getSubmoduleStatus: vi.fn(async () => [submodule('modules/auth-kit', ' ')]),
        });
        const router = new GraphMessageRouter(makeRepositoryAccessor(repo), () => undefined);

        await router.handle({
            type: 'graph/branchCommand',
            command: 'checkout',
            branch: 'feature/oauth',
            isRemote: false,
            repositoryScope: { kind: 'submodule', path: 'modules/auth-kit', label: 'auth-kit' },
        });

        expect(vi.mocked(repo.exec)).toHaveBeenCalledWith(['-C', 'modules/auth-kit', 'checkout', 'feature/oauth'], undefined);
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

        expect(messages).toContainEqual(expect.objectContaining({
            type: 'graph/operationStatus',
            status: GraphOperationStatus.Failed,
            category: GraphOperationCategory.Branch,
            command: 'mergeInto',
            target: 'feature/conflict',
        }));
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

    it('uses runtime repository capabilities for worktrees created from branches', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo', 'main-head', 'main'), isMain: true, branch: 'refs/heads/main' },
            ]),
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            addWorktree: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktreeModel({}));
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );
        const worktreePath = missingPath('look-git-feature-runtime-wt-');

        setInputBoxValue(worktreePath);
        await router.handle({ type: 'graph/branchCommand', command: 'newWorktreeFromBranch', branch: 'feature/a', isRemote: false });

        expect(runtimeRepository.addWorktree).toHaveBeenCalledWith({
            path: worktreePath,
            branch: 'feature/a',
        });
        expect(vi.mocked(repo.exec)).not.toHaveBeenCalledWith(['worktree', 'add', worktreePath, 'feature/a']);
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

    it('uses runtime repository capabilities for branch worktree removal', async () => {
        const repo = makeRepositoryMock({
            listWorktrees: vi.fn(async () => [
                { ...worktree('/repo/.worktrees/a', 'topic-head', 'feature/a'), branch: 'refs/heads/feature/a' },
            ]),
        });
        const context = repoContext();
        const runtimeRegistry = new RepositoryRegistry();
        const runtimeRepository = runtimeRepositoryModel({
            removeWorktree: vi.fn(async () => {}),
        });
        runtimeRegistry.registerRepository(runtimeRepository);
        runtimeRegistry.registerWorktree(runtimeWorktreeModel({}));
        const router = new GraphMessageRouter(
            makeAccessorWithContext(repo, context),
            () => undefined,
            async () => {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            runtimeRegistry,
        );

        setWarningChoice('Remove');
        await router.handle({ type: 'graph/branchCommand', command: 'removeBranchWorktree', branch: 'feature/a', isRemote: false });

        expect(runtimeRepository.removeWorktree).toHaveBeenCalledWith('/repo/.worktrees/a', false);
        expect(vi.mocked(repo.removeWorktree)).not.toHaveBeenCalled();
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

function repoContext(): RepoContext {
    return {
        id: 'repo',
        cwd: '/workspace',
        kind: RepoKind.Main,
        label: 'workspace',
    };
}

function makeAccessorWithContext(repo: GitRepository, context: RepoContext): ActiveRepositoryAccessor {
    return {
        currentRepository: repo,
        currentContext: context,
        requireRepository() {
            return repo;
        },
    };
}

const runtime = {
    supports: () => false,
    execute: async () => undefined,
} satisfies GitRuntime;

function runtimeRepositoryModel(overrides: Partial<RuntimeRepository>): RuntimeRepository {
    return {
        repoId: 'repo',
        gitDir: '/workspace/.git',
        kind: 'main',
        label: 'workspace',
        runtime,
        addWorktree: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        resolveRef: vi.fn(async () => 'abc123'),
        listBranches: vi.fn(async () => []),
        deleteBranch: vi.fn(async () => {}),
        renameBranch: vi.fn(async () => {}),
        ...overrides,
    } as RuntimeRepository;
}

function runtimeWorktreeModel(overrides: Partial<Worktree>): Worktree {
    return {
        repoId: 'repo',
        worktreeId: 'repo',
        path: '/workspace',
        isMain: true,
        head: 'abc123',
        dirty: false,
        runtime,
        checkout: vi.fn(async () => {}),
        checkoutNewBranch: vi.fn(async () => {}),
        merge: vi.fn(async () => {}),
        rebase: vi.fn(async () => {}),
        cherryPick: vi.fn(async () => {}),
        revertCommit: vi.fn(async () => {}),
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' })),
        stageAll: vi.fn(async () => {}),
        commit: vi.fn(async () => {}),
        stash: vi.fn(async () => {}),
        getFileAtRevision: vi.fn(async () => ''),
        resetSoft: vi.fn(async () => {}),
        resetMixed: vi.fn(async () => {}),
        resetHard: vi.fn(async () => {}),
        undoLastCommit: vi.fn(async () => {}),
        ...overrides,
    } as Worktree;
}
