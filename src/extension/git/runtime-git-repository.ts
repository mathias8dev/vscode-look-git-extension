import type { GitCommit, GitFileChange } from '../../core/git/domain/GitCommit';
import type { Page, PageRequest } from '../../core/git/domain/Page';
import type { GitBranch, GitStatus, GitTag } from '../../core/git/domain/GitStatus';
import type { GitSubmodule, GitWorktree } from '../../core/git/domain/GitWorktree';
import type {
    AddWorktreeInput,
    CommitGraphQuery,
    FetchOptions,
    FileSelection,
    RefCompareOptions,
    SubmoduleUpdateOptions,
} from '../../application/ports/git-capabilities';
import type { GitRepository } from '../../application/ports/git-topology';
import { UnsupportedGitOperationError, type GitExecutionContext, type GitRuntime, type RepositoryKind } from '../../application/ports/git-runtime';
import type { SemanticGitOperation } from '../../application/ports/git-operation';
import { HybridGitRuntime } from './hybrid-git-runtime';

export interface RuntimeGitRepositoryInput {
    readonly repoId: string;
    readonly cwd: string;
    readonly gitDir: string;
    readonly kind: RepositoryKind;
    readonly label: string;
    readonly parentRepositoryId?: string;
}

export class RuntimeGitRepository implements GitRepository {
    readonly repoId: string;
    readonly cwd: string;
    readonly gitDir: string;
    readonly kind: RepositoryKind;
    readonly label: string;

    private readonly context: GitExecutionContext;

    constructor(
        input: RuntimeGitRepositoryInput,
        readonly runtime: GitRuntime = new HybridGitRuntime(),
    ) {
        this.repoId = input.repoId;
        this.cwd = input.cwd;
        this.gitDir = input.gitDir;
        this.kind = input.kind;
        this.label = input.label;
        this.context = {
            cwd: input.cwd,
            gitDir: input.gitDir,
            repositoryId: input.repoId,
            kind: input.kind,
            parentRepositoryId: input.parentRepositoryId,
        };
    }

    getCommitGraph(query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>> {
        return this.execute('getCommitGraph', { query, pageRequest }, signal);
    }

    getCommitDetails(commit: string, signal?: AbortSignal): Promise<GitCommit> {
        return this.execute('getCommitDetails', { commit }, signal);
    }

    getCommitPatch(commit: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getCommitPatch', { commit }, signal);
    }

    getCommitFileDiff(commit: string, path: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getCommitFileDiff', { commit, path }, signal);
    }

    getCommitRange(fromRef: string, toRef: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>> {
        return this.execute('getCommitRange', { fromRef, toRef, pageRequest }, signal);
    }

    searchCommits(query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>> {
        return this.execute('searchCommits', { query, pageRequest }, signal);
    }

    getMergeBase(leftRef: string, rightRef: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getMergeBase', { leftRef, rightRef }, signal);
    }

    getAheadBehind(localRef: string, upstreamRef: string, signal?: AbortSignal): Promise<{ readonly ahead: number; readonly behind: number }> {
        return this.execute('getAheadBehind', { localRef, upstreamRef }, signal);
    }

    getFileHistory(path: string, query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>> {
        return this.execute('getFileHistory', { path, query, pageRequest }, signal);
    }

    getFileSelectionHistory(path: string, selection: FileSelection, query: CommitGraphQuery, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitCommit>> {
        return this.execute('getFileSelectionHistory', { path, selection, query, pageRequest }, signal);
    }

    getFileAtRevision(path: string, revision: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getFileAtRevision', { path, revision }, signal);
    }

    getFileRenameHistory(path: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitFileChange>> {
        return this.execute('getFileRenameHistory', { path, pageRequest }, signal);
    }

    getBlame(path: string, revision: string | undefined, signal?: AbortSignal): Promise<string> {
        return this.execute('getBlame', { path, revision }, signal);
    }

    getBlameForSelection(path: string, selection: FileSelection, revision: string | undefined, signal?: AbortSignal): Promise<string> {
        return this.execute('getBlameForSelection', { path, selection, revision }, signal);
    }

    getBlameCommit(commit: string, signal?: AbortSignal): Promise<GitCommit> {
        return this.execute('getBlameCommit', { commit }, signal);
    }

    compareRefs(baseRef: string, headRef: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return this.execute('compareRefs', { baseRef, headRef, options }, signal);
    }

    compareBranches(baseBranch: string, headBranch: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return this.execute('compareBranches', { baseBranch, headBranch, options }, signal);
    }

    compareWithWorkingTree(baseRef: string, worktree: string, options: RefCompareOptions, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return this.execute('compareWithWorkingTree', { baseRef, worktree, options }, signal);
    }

    compareFiles(baseRef: string, headRef: string, path: string, signal?: AbortSignal): Promise<string> {
        return this.execute('compareFiles', { baseRef, headRef, path }, signal);
    }

    listChangedFiles(baseRef: string, headRef: string, pageRequest: PageRequest, signal?: AbortSignal): Promise<Page<GitFileChange>> {
        return this.execute('listChangedFiles', { baseRef, headRef, pageRequest }, signal);
    }

    listBranches(signal?: AbortSignal): Promise<readonly GitBranch[]> {
        return this.execute('listBranches', undefined, signal);
    }

    listRemoteBranches(signal?: AbortSignal): Promise<readonly GitBranch[]> {
        return this.execute('listRemoteBranches', undefined, signal);
    }

    listTags(signal?: AbortSignal): Promise<readonly GitTag[]> {
        return this.execute('listTags', undefined, signal);
    }

    listRemotes(signal?: AbortSignal): Promise<readonly string[]> {
        return this.execute('listRemotes', undefined, signal);
    }

    resolveRef(ref: string, signal?: AbortSignal): Promise<string> {
        return this.execute('resolveRef', ref, signal);
    }

    createBranch(name: string, startPoint: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('createBranch', { name, startPoint }, signal);
    }

    renameBranch(oldName: string, newName: string, signal?: AbortSignal): Promise<void> {
        return this.execute('renameBranch', { oldName, newName }, signal);
    }

    deleteBranch(name: string, force: boolean, signal?: AbortSignal): Promise<void> {
        return this.execute('deleteBranch', { name, force }, signal);
    }

    setUpstream(branch: string, upstream: string, signal?: AbortSignal): Promise<void> {
        return this.execute('setUpstream', { branch, upstream }, signal);
    }

    createTag(name: string, target: string, message: string | undefined, signal?: AbortSignal): Promise<void> {
        return this.execute('createTag', { name, target, message }, signal);
    }

    deleteTag(name: string, signal?: AbortSignal): Promise<void> {
        return this.execute('deleteTag', { name }, signal);
    }

    fetch(remote: string, options: FetchOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('fetch', { remote, options }, signal);
    }

    fetchAll(options: FetchOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('fetchAll', { options }, signal);
    }

    pruneRemote(remote: string, signal?: AbortSignal): Promise<void> {
        return this.execute('pruneRemote', remote, signal);
    }

    getRemoteUrl(remote: string, signal?: AbortSignal): Promise<string> {
        return this.execute('getRemoteUrl', remote, signal);
    }

    setRemoteUrl(remote: string, url: string, signal?: AbortSignal): Promise<void> {
        return this.execute('setRemoteUrl', { remote, url }, signal);
    }

    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]> {
        return this.execute('listWorktrees', undefined, signal);
    }

    addWorktree(input: AddWorktreeInput, signal?: AbortSignal): Promise<void> {
        return this.execute('addWorktree', input, signal);
    }

    removeWorktree(worktree: string, force: boolean, signal?: AbortSignal): Promise<void> {
        return this.execute('removeWorktree', { worktree, force }, signal);
    }

    pruneWorktrees(signal?: AbortSignal): Promise<void> {
        return this.execute('pruneWorktrees', undefined, signal);
    }

    repairWorktree(worktree: string, signal?: AbortSignal): Promise<void> {
        return this.execute('repairWorktree', { worktree }, signal);
    }

    listSubmodules(signal?: AbortSignal): Promise<readonly GitSubmodule[]> {
        return this.execute('listSubmodules', undefined, signal);
    }

    getSubmoduleStatus(path: string, signal?: AbortSignal): Promise<GitSubmodule> {
        return this.execute('getSubmoduleStatus', { path }, signal);
    }

    initSubmodule(path: string, signal?: AbortSignal): Promise<void> {
        return this.execute('initSubmodule', { path }, signal);
    }

    updateSubmodule(path: string, options: SubmoduleUpdateOptions, signal?: AbortSignal): Promise<void> {
        return this.execute('updateSubmodule', { path, options }, signal);
    }

    syncSubmodule(path: string, signal?: AbortSignal): Promise<void> {
        return this.execute('syncSubmodule', { path }, signal);
    }

    fetchSubmodule(path: string, signal?: AbortSignal): Promise<void> {
        return this.execute('fetchSubmodule', { path }, signal);
    }

    deinitSubmodule(path: string, force: boolean, signal?: AbortSignal): Promise<void> {
        return this.execute('deinitSubmodule', { path, force }, signal);
    }

    openSubmoduleRepository(path: string, signal?: AbortSignal): Promise<string> {
        return this.execute('openSubmoduleRepository', { path }, signal);
    }

    private execute<TInput, TResult>(operation: SemanticGitOperation, input: TInput, signal?: AbortSignal): Promise<TResult> {
        if (!this.runtime.supports(operation, this.context)) {
            return Promise.reject(new UnsupportedGitOperationError(operation, this.context));
        }
        return this.runtime.execute<TInput, TResult>(operation, this.context, input, signal);
    }
}
