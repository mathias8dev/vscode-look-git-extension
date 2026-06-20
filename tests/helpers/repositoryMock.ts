import { vi } from 'vitest';
import type { GitRepository } from '../../src/application/ports/git-repository';
import { Page } from '../../src/core/git/domain/Page';
import { GitCommit } from '../../src/core/git/domain/GitCommit';
import { parseNameStatusZ } from '../../src/core/parsing/parseNameStatus';
import type { GitRepository as RuntimeRepository } from '../../src/application/ports/git-topology';
import type { ActiveRepositoryAccessor } from '../../src/extension/repositories/ActiveRepositoryRegistry';

type RepositoryMock = GitRepository & Partial<RuntimeRepository>;

export function makeRepositoryMock(overrides: Partial<RepositoryMock> = {}): GitRepository {
    const repo = {
        cwd: '/workspace',
        repoId: 'repo',
        gitDir: '/workspace/.git',
        kind: 'main' as const,
        label: 'workspace',
        worktreeId: 'repo',
        path: '/workspace',
        isMain: true,
        head: 'HEAD',
        dirty: false,
        runtime: {
            supports: vi.fn(() => true),
            execute: vi.fn(async () => undefined),
        },
        exec: vi.fn(async () => ''),
        execRaw: vi.fn(async () => ''),
        execWithEnv: vi.fn(async () => ''),
        getGitDir: vi.fn(async () => '/workspace/.git'),
        getStatus: vi.fn(async () => ({ staged: [], unstaged: [], conflicts: [], conflictState: 'none' as const })),
        getSubmodulePaths: vi.fn(async () => new Set<string>()),
        stashList: vi.fn(async () => []),
        getStashFiles: vi.fn(async () => []),
        getLog: vi.fn(async () => []),
        getLogForRef: vi.fn(async () => []),
        getLogForPath: vi.fn(async () => []),
        getLogForRefAndPath: vi.fn(async () => []),
        getLogForLineRange: vi.fn(async () => []),
        getGraphLog: vi.fn(async () => []),
        getCommitFiles: vi.fn(async () => []),
        getCommitMessage: vi.fn(async () => ''),
        getAllBranches: vi.fn(async () => []),
        getAllTags: vi.fn(async () => []),
        getCurrentBranch: vi.fn(async () => 'main'),
        getUserName: vi.fn(async () => ''),
        getRemotes: vi.fn(async () => []),
        listWorktrees: vi.fn(async () => []),
        addWorktree: vi.fn(async () => {}),
        removeWorktree: vi.fn(async () => {}),
        getSubmoduleStatus: vi.fn(async () => []),
        updateSubmodule: vi.fn(async () => {}),
        updateAllSubmodules: vi.fn(async () => {}),
        stageFile: vi.fn(async () => {}),
        unstageFile: vi.fn(async () => {}),
        stageAll: vi.fn(async () => {}),
        unstageAll: vi.fn(async () => {}),
        discardFile: vi.fn(async () => {}),
        commit: vi.fn(async () => {}),
        commitAmend: vi.fn(async () => {}),
        push: vi.fn(async () => {}),
        pullAndPush: vi.fn(async () => {}),
        acceptOurs: vi.fn(async () => {}),
        acceptTheirs: vi.fn(async () => {}),
        mergeContinue: vi.fn(async () => {}),
        mergeAbort: vi.fn(async () => {}),
        rebaseContinue: vi.fn(async () => {}),
        rebaseAbort: vi.fn(async () => {}),
        stash: vi.fn(async () => {}),
        stashStaged: vi.fn(async () => {}),
        stashPop: vi.fn(async () => {}),
        stashApply: vi.fn(async () => {}),
        stashDrop: vi.fn(async () => {}),
        checkout: vi.fn(async () => {}),
        checkoutNewBranch: vi.fn(async () => {}),
        deleteBranch: vi.fn(async () => {}),
        deleteRemoteBranch: vi.fn(async () => {}),
        renameBranch: vi.fn(async () => {}),
        rebase: vi.fn(async () => {}),
        merge: vi.fn(async () => {}),
        pushBranch: vi.fn(async () => {}),
        fetchBranch: vi.fn(async () => {}),
        fetchAll: vi.fn(async () => {}),
        pull: vi.fn(async () => {}),
        ...overrides,
    } satisfies RepositoryMock;

    return {
        ...repo,
        getCommitGraph: vi.fn(async (query, pageRequest, signal) => {
            const skip = pageRequest.encodedCursor ? parseInt(pageRequest.encodedCursor, 10) : 0;
            const commits = await repo.getGraphLog(pageRequest.limit, query.branches, query.path, {
                search: query.search,
                authors: query.authors,
                dateFrom: query.dateFrom,
                dateTo: query.dateTo,
                skip,
            }, signal);
            return new Page(commits, commits.length > pageRequest.limit);
        }),
        getCommitDetails: vi.fn(async (commit, signal) => {
            const existing = (await repo.getLogForRef(commit, 1, 0, signal))[0];
            return existing ?? new GitCommit({
                hash: commit,
                shortHash: commit.substring(0, 7),
                message: '',
                authorName: '',
                authorEmail: '',
                authorDate: '',
                parentHashes: [],
            });
        }),
        getCommitPatch: vi.fn(async (commit, signal) => repo.execRaw(['format-patch', '-1', '--stdout', commit], signal)),
        getCommitFileDiff: vi.fn(async (commit, path, signal) => repo.execRaw(['show', '--format=', '--patch', commit, '--', path], signal)),
        getCommitRange: vi.fn(async (_fromRef, _toRef) => new Page([], false)),
        searchCommits: vi.fn(async () => new Page([], false)),
        getMergeBase: vi.fn(async (leftRef, rightRef, signal) => repo.exec(['merge-base', leftRef, rightRef], signal)),
        getAheadBehind: vi.fn(async () => ({ ahead: 0, behind: 0 })),
        getReachableCommitHashes: vi.fn(async (hashes, signal) => {
            const unique = Array.from(new Set(hashes));
            if (unique.length === 0) { return new Set<string>(); }
            const unreachableRaw = await repo.execRaw(['rev-list', '--no-walk', ...unique, '--not', 'HEAD'], signal);
            const unreachable = new Set(unreachableRaw.split(/\r?\n/).filter(Boolean));
            return new Set(unique.filter((hash) => {
                for (const candidate of unreachable) {
                    if (candidate === hash || candidate.startsWith(hash) || hash.startsWith(candidate)) { return false; }
                }
                return true;
            }));
        }),
        orderCommits: vi.fn(async (hashes, direction) => {
            const unique = Array.from(new Set(hashes));
            if (unique.length <= 1) { return unique; }
            const raw = await repo.exec(['rev-list', '--topo-order', ...unique]);
            const selected = new Set(unique);
            const newestFirst = raw.split(/\s+/).filter((hash) => selected.has(hash));
            const seen = new Set(newestFirst);
            const ordered = [...newestFirst, ...unique.filter((hash) => !seen.has(hash))];
            return direction === 'newestFirst' ? ordered : ordered.slice().reverse();
        }),
        getFileHistory: vi.fn(async () => new Page([], false)),
        getFileSelectionHistory: vi.fn(async () => new Page([], false)),
        getFileAtRevision: vi.fn(async (path, revision, signal) => repo.execRaw(['show', `${revision}:${path}`], signal)),
        getFileRenameHistory: vi.fn(async () => new Page([], false)),
        getBlame: vi.fn(async () => ''),
        getBlameForSelection: vi.fn(async () => ''),
        getBlameCommit: vi.fn(async () => { throw new Error('Not implemented.'); }),
        compareRefs: vi.fn(async () => []),
        compareBranches: vi.fn(async () => []),
        compareWithWorkingTree: vi.fn(async () => []),
        compareFiles: vi.fn(async () => ''),
        listChangedFiles: vi.fn(async () => new Page([], false)),
        listBranches: vi.fn((signal) => repo.getAllBranches(signal)),
        listRemoteBranches: vi.fn(async () => []),
        listTags: vi.fn((signal) => repo.getAllTags(signal)),
        listRemotes: vi.fn((signal) => repo.getRemotes(signal)),
        resolveRef: vi.fn((ref, signal) => repo.exec(['rev-parse', ref], signal)),
        getUpstreamBranch: vi.fn(async (branch, signal) => {
            const upstream = await repo.execRaw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${branch}`], signal);
            return upstream.trim() || undefined;
        }),
        createBranch: vi.fn(async (name, startPoint, signal) => {
            await repo.exec(startPoint ? ['branch', name, startPoint] : ['branch', name], signal);
        }),
        createTag: vi.fn(async (name, target, message, signal) => {
            await repo.exec(message ? ['tag', '-a', name, target, '-m', message] : ['tag', name, target], signal);
        }),
        listSubmodules: vi.fn((signal) => repo.getSubmoduleStatus(signal)),
        getSubmoduleStatus: vi.fn(async (pathOrSignal?: string | AbortSignal, signal?: AbortSignal) => {
            if (typeof pathOrSignal !== 'string') {
                return repo.getSubmoduleStatus(pathOrSignal);
            }
            const submodule = (await repo.getSubmoduleStatus(signal)).find((candidate) => candidate.path === pathOrSignal);
            if (!submodule) { throw new Error(`Submodule "${pathOrSignal}" was not found.`); }
            return submodule;
        }),
        updateSubmodule: vi.fn(async (path, optionsOrSignal?: unknown, signal?: AbortSignal) => {
            await repo.updateSubmodule(path, optionsOrSignal instanceof AbortSignal ? optionsOrSignal : signal);
        }),
        initSubmodule: vi.fn(async (path, signal) => repo.updateSubmodule(path, signal)),
        syncSubmodule: vi.fn(async () => {}),
        fetchSubmodule: vi.fn(async () => {}),
        deinitSubmodule: vi.fn(async () => {}),
        openSubmoduleRepository: vi.fn(async (path) => path),
        addWorktree: vi.fn(async (inputOrPath, branchOrSignal?: string | AbortSignal, createNew?: boolean, signal?: AbortSignal) => {
            if (typeof inputOrPath === 'string') {
                await repo.addWorktree(inputOrPath, typeof branchOrSignal === 'string' ? branchOrSignal : '', createNew, signal);
                return;
            }
            await repo.addWorktree(inputOrPath.path, inputOrPath.branch, inputOrPath.createNew, branchOrSignal instanceof AbortSignal ? branchOrSignal : signal);
        }),
        addDetachedWorktree: vi.fn(async (worktreePath, ref, signal) => {
            await repo.exec(['worktree', 'add', '--detach', worktreePath, ref], signal);
        }),
        removeWorktree: vi.fn(async (worktree, force, signal) => repo.removeWorktree(worktree, force, signal)),
        pruneWorktrees: vi.fn(async () => {}),
        repairWorktree: vi.fn(async () => {}),
        lockWorktree: vi.fn(async (worktree, signal) => repo.exec(['worktree', 'lock', worktree], signal)),
        unlockWorktree: vi.fn(async (worktree, signal) => repo.exec(['worktree', 'unlock', worktree], signal)),
        getCommitFiles: vi.fn(async (commit, signal) => {
            const raw = await repo.execRaw(['diff-tree', '--no-commit-id', '--name-status', '-r', '-z', '--root', commit], signal);
            return raw ? parseNameStatusZ(raw) : [];
        }),
        getCommitMessage: vi.fn((commit, signal) => repo.getCommitMessage(commit, signal)),
        getUntrackedFiles: vi.fn(async () => new Page([], false)),
        getIgnoredFiles: vi.fn(async () => new Page([], false)),
        stage: vi.fn(async (paths, signal) => { await repo.exec(['add', '--', ...paths], signal); }),
        stageHunks: vi.fn(async () => {}),
        stageLines: vi.fn(async () => {}),
        unstage: vi.fn(async (paths, signal) => { await repo.exec(['reset', 'HEAD', '--', ...paths], signal); }),
        unstageHunks: vi.fn(async () => {}),
        getFileFromIndex: vi.fn(async (path, signal) => repo.execRaw(['show', `:${path}`], signal)),
        discard: vi.fn(async (paths, signal) => { await repo.exec(['checkout', '--', ...paths], signal); }),
        discardHunks: vi.fn(async () => {}),
        markResolved: vi.fn(async (paths, signal) => { await repo.exec(['add', '--', ...paths], signal); }),
        acceptOurs: vi.fn(async (paths, signal) => { await repo.exec(['checkout', '--ours', '--', ...paths], signal); }),
        acceptTheirs: vi.fn(async (paths, signal) => { await repo.exec(['checkout', '--theirs', '--', ...paths], signal); }),
        getWorkingTreeDiff: vi.fn(async () => ''),
        getIndexDiff: vi.fn(async () => ''),
        getCombinedDiff: vi.fn(async () => ''),
        getPatch: vi.fn(async () => ''),
        applyPatch: vi.fn(async () => {}),
        reverseApplyPatch: vi.fn(async () => {}),
        applyPatchToIndex: vi.fn(async () => {}),
        checkPatch: vi.fn(async () => true),
        amendCommit: vi.fn(async (message, _options, signal) => { await repo.commitAmend(message, signal); }),
        commitAll: vi.fn(async (message, _options, signal) => {
            await repo.stageAll(signal);
            await repo.commit(message, signal);
        }),
        createFixupCommit: vi.fn(async (targetCommit, _message, signal) => { await repo.exec(['commit', '--fixup', targetCommit, '--no-edit'], signal); }),
        createSquashCommit: vi.fn(async () => {}),
        listStashes: vi.fn(async (pageRequest, signal) => new Page(await repo.stashList(signal), false, pageRequest.encodedCursor)),
        getStashSummary: vi.fn(async (stash, signal) => repo.exec(['stash', 'show', '--stat', stash], signal)),
        applyStash: vi.fn(async (stash, _options, signal) => { await repo.exec(['stash', 'apply', stash], signal); }),
        popStash: vi.fn(async (stash, _options, signal) => { await repo.exec(['stash', 'pop', stash], signal); }),
        dropStash: vi.fn(async (stash, signal) => { await repo.exec(['stash', 'drop', stash], signal); }),
        clearStashes: vi.fn(async (signal) => { await repo.exec(['stash', 'clear'], signal); }),
        branchFromStash: vi.fn(async () => {}),
        checkoutNewBranch: vi.fn(async (name, startPoint, signal) => { await repo.checkoutNewBranch(name, startPoint, signal); }),
        restorePaths: vi.fn(async () => {}),
        restoreStaged: vi.fn(async (paths, signal) => { await repo.exec(['restore', '--staged', '--', ...paths], signal); }),
        restoreWorkingTree: vi.fn(async (paths, signal) => { await repo.exec(['restore', '--', ...paths], signal); }),
        continueMerge: vi.fn(async (signal) => { await repo.mergeContinue(signal); }),
        abortMerge: vi.fn(async (signal) => { await repo.mergeAbort(signal); }),
        quitMerge: vi.fn(async () => {}),
        continueRebase: vi.fn(async (signal) => { await repo.rebaseContinue(signal); }),
        abortRebase: vi.fn(async (signal) => { await repo.rebaseAbort(signal); }),
        skipRebase: vi.fn(async () => {}),
        quitRebase: vi.fn(async () => {}),
        getInteractiveRebasePlan: vi.fn(async () => ''),
        startInteractiveRebase: vi.fn(async () => {}),
        rewordCommit: vi.fn(async () => {}),
        squashCommits: vi.fn(async () => {}),
        fixupCommits: vi.fn(async () => {}),
        reorderCommits: vi.fn(async () => {}),
        editCommit: vi.fn(async () => {}),
        dropCommit: vi.fn(async () => {}),
        cherryPick: vi.fn(async (commit, _options, signal) => { await repo.exec(['cherry-pick', commit], signal); }),
        continueCherryPick: vi.fn(async () => {}),
        abortCherryPick: vi.fn(async () => {}),
        skipCherryPick: vi.fn(async () => {}),
        revertCommit: vi.fn(async (commit, _options, signal) => { await repo.exec(['revert', '--no-edit', commit], signal); }),
        continueRevert: vi.fn(async () => {}),
        abortRevert: vi.fn(async () => {}),
        skipRevert: vi.fn(async () => {}),
        resetSoft: vi.fn(async (ref, signal) => { await repo.exec(['reset', '--soft', ref], signal); }),
        resetMixed: vi.fn(async (ref, signal) => { await repo.exec(['reset', '--mixed', ref], signal); }),
        resetHard: vi.fn(async (ref, signal) => { await repo.exec(['reset', '--hard', ref], signal); }),
        resetKeep: vi.fn(async (ref, signal) => { await repo.exec(['reset', '--keep', ref], signal); }),
        resetPaths: vi.fn(async () => {}),
        undoLastCommit: vi.fn(async (mode, signal) => { await repo.exec(['reset', `--${mode}`, 'HEAD~1'], signal); }),
        undoAmend: vi.fn(async () => {}),
        undoCheckout: vi.fn(async () => {}),
        getReflog: vi.fn(async () => new Page([], false)),
        restoreFromReflog: vi.fn(async () => {}),
        cleanUntracked: vi.fn(async () => {}),
        cleanIgnored: vi.fn(async () => {}),
        previewClean: vi.fn(async () => []),
        pull: vi.fn(async (_options, signal) => { await repo.pull(signal); }),
        push: vi.fn(async (_remote, _options, signal) => { await repo.push(signal); }),
        pushBranch: vi.fn(async (remote, branch, _options, signal) => { await repo.pushBranch(remote, branch, signal); }),
        pushRef: vi.fn(async (remote, sourceRef, destinationRef, _options, signal) => { await repo.exec(['push', remote, `${sourceRef}:${destinationRef}`], signal); }),
        pushTags: vi.fn(async () => {}),
        forcePushWithLease: vi.fn(async () => {}),
    } as GitRepository;
}

export function makeRepositoryAccessor(repo: GitRepository | undefined): ActiveRepositoryAccessor {
    return {
        currentRepository: repo,
        currentContext: undefined,
        requireRepository() {
            if (!repo) { throw new Error('No active Git repository.'); }
            return repo;
        },
    };
}
