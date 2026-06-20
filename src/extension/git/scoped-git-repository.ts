import * as path from 'path';
import type { GitExec } from '../../core/git/git-exec';
import type { GitCommit, GitFileChange, GitGraphCommit } from '../../core/git/domain/GitCommit';
import type { GitBranch, GitStash, GitStatus, GitTag } from '../../core/git/domain/GitStatus';
import type { GitSubmodule, GitWorktree } from '../../core/git/domain/GitWorktree';
import type { GitRepository, GraphLogFilters } from '../../application/ports/git-repository';
import { queryCommitFiles, queryCommitLog, queryCommitLineRangeLog, queryCommitMessage, queryAllBranches, queryAllTags, queryCurrentBranch, queryGraphLog, queryRemotes, queryUserName } from '../../core/queries/queryGraph';
import { queryStatus, queryStashFiles, queryStashList, querySubmodulePaths } from '../../core/queries/queryStatus';
import { addWorktree, queryWorktrees, removeWorktree } from '../../core/queries/queryWorktrees';
import { querySubmoduleStatus, updateAllSubmodules, updateSubmodule } from '../../core/queries/querySubmodules';

export class ScopedGitRepository implements GitRepository {
    readonly cwd: string;

    constructor(
        private readonly parent: GitRepository,
        private readonly relativePath: string,
    ) {
        this.cwd = path.resolve(parent.cwd, relativePath);
    }

    exec(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.parent.exec(['-C', this.relativePath, ...args], signal);
    }

    execRaw(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.parent.execRaw(['-C', this.relativePath, ...args], signal);
    }

    execWithEnv(args: readonly string[], env: Record<string, string>, signal?: AbortSignal): Promise<string> {
        return this.parent.execWithEnv(['-C', this.relativePath, ...args], env, signal);
    }

    async getGitDir(): Promise<string> {
        const gitDir = await this.exec(['rev-parse', '--git-dir']);
        return path.isAbsolute(gitDir) ? gitDir : path.resolve(this.cwd, gitDir);
    }

    async getStatus(signal?: AbortSignal): Promise<GitStatus> {
        const status = await queryStatus(this.raw, signal);
        return { ...status, conflictState: 'none' };
    }

    getSubmodulePaths(signal?: AbortSignal): Promise<ReadonlySet<string>> {
        return querySubmodulePaths(this.raw, signal);
    }

    stashList(signal?: AbortSignal): Promise<readonly GitStash[]> {
        return queryStashList(this.trimmed, signal);
    }

    getStashFiles(index: number, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return queryStashFiles(this.raw, index, signal);
    }

    getLog(limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.raw, limit, skip, undefined, undefined, signal);
    }

    getLogForRef(ref: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.raw, limit, skip, ref, undefined, signal);
    }

    getLogForPath(pathFilter: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.raw, limit, skip, undefined, pathFilter, signal);
    }

    getLogForRefAndPath(ref: string, pathFilter: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.raw, limit, skip, ref, pathFilter, signal);
    }

    getLogForLineRange(filePath: string, startLine: number, endLine: number, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLineRangeLog(this.raw, limit, skip, filePath, startLine, endLine, signal);
    }

    getGraphLog(maxCount: number, branches?: readonly string[], pathFilter?: string, filters?: GraphLogFilters, signal?: AbortSignal): Promise<readonly GitGraphCommit[]> {
        return queryGraphLog(this.raw, maxCount, branches, pathFilter, filters, signal);
    }

    getCommitFiles(commitHash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return queryCommitFiles(this.raw, commitHash, signal);
    }

    getCommitMessage(commitHash: string, signal?: AbortSignal): Promise<string> {
        return queryCommitMessage(this.trimmed, commitHash, signal);
    }

    getAllBranches(signal?: AbortSignal): Promise<readonly GitBranch[]> {
        return queryAllBranches(this.raw, (s) => this.getCurrentBranch(s), signal);
    }

    getAllTags(signal?: AbortSignal): Promise<readonly GitTag[]> {
        return queryAllTags(this.raw, signal);
    }

    getCurrentBranch(signal?: AbortSignal): Promise<string> {
        return queryCurrentBranch(this.trimmed, signal);
    }

    getUserName(signal?: AbortSignal): Promise<string> {
        return queryUserName(this.trimmed, signal);
    }

    getRemotes(signal?: AbortSignal): Promise<readonly string[]> {
        return queryRemotes(this.trimmed, signal);
    }

    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]> {
        return queryWorktrees(this.raw, signal);
    }

    addWorktree(worktreePath: string, branch: string, createNew = false, signal?: AbortSignal): Promise<void> {
        return addWorktree(this.trimmed, worktreePath, branch, createNew, undefined, signal);
    }

    removeWorktree(worktreePath: string, force = false, signal?: AbortSignal): Promise<void> {
        return removeWorktree(this.trimmed, worktreePath, force, signal);
    }

    getSubmoduleStatus(signal?: AbortSignal): Promise<readonly GitSubmodule[]> {
        return querySubmoduleStatus(this.raw, signal);
    }

    updateSubmodule(submodulePath: string, signal?: AbortSignal): Promise<void> {
        return updateSubmodule(this.trimmed, submodulePath, signal);
    }

    updateAllSubmodules(signal?: AbortSignal): Promise<void> {
        return updateAllSubmodules(this.trimmed, signal);
    }

    async stageFile(filePath: string): Promise<void> { await this.exec(['add', '--', filePath]); }
    async unstageFile(filePath: string): Promise<void> { await this.exec(['reset', 'HEAD', '--', filePath]); }
    async stageAll(): Promise<void> { await this.exec(['add', '-A']); }
    async unstageAll(): Promise<void> { await this.exec(['reset', 'HEAD']); }
    async discardFile(filePath: string): Promise<void> {
        try { await this.exec(['checkout', '--', filePath]); }
        catch { await this.exec(['clean', '-f', '--', filePath]); }
    }
    async commit(message: string): Promise<void> { await this.exec(['commit', '-m', message]); }
    async commitAmend(message: string): Promise<void> { await this.exec(['commit', '--amend', '-m', message]); }
    async push(): Promise<void> { await this.exec(['push']); }
    async pullAndPush(): Promise<void> { await this.exec(['pull', '--rebase']); await this.exec(['push']); }
    async acceptOurs(filePath: string): Promise<void> { await this.exec(['checkout', '--ours', '--', filePath]); }
    async acceptTheirs(filePath: string): Promise<void> { await this.exec(['checkout', '--theirs', '--', filePath]); }
    async mergeContinue(): Promise<void> { await this.exec(['-c', 'core.editor=true', 'merge', '--continue']); }
    async mergeAbort(): Promise<void> { await this.exec(['merge', '--abort']); }
    async rebaseContinue(): Promise<void> { await this.exec(['-c', 'core.editor=true', 'rebase', '--continue']); }
    async rebaseAbort(): Promise<void> { await this.exec(['rebase', '--abort']); }
    async stash(message?: string): Promise<void> { await this.exec(message ? ['stash', 'push', '-m', message] : ['stash', 'push']); }
    async stashStaged(message?: string): Promise<void> { await this.exec(message ? ['stash', 'push', '--staged', '-m', message] : ['stash', 'push', '--staged']); }
    async stashPop(index: number): Promise<void> { await this.exec(['stash', 'pop', `stash@{${index}}`]); }
    async stashApply(index: number): Promise<void> { await this.exec(['stash', 'apply', `stash@{${index}}`]); }
    async stashDrop(index: number): Promise<void> { await this.exec(['stash', 'drop', `stash@{${index}}`]); }
    async checkout(ref: string): Promise<void> { await this.exec(['checkout', ref]); }
    async checkoutNewBranch(branchName: string, startPoint?: string): Promise<void> { await this.exec(startPoint ? ['checkout', '-b', branchName, startPoint] : ['checkout', '-b', branchName]); }
    async deleteBranch(branchName: string): Promise<void> { await this.exec(['branch', '-D', branchName]); }
    async deleteRemoteBranch(remote: string, branchName: string): Promise<void> { await this.exec(['push', remote, '--delete', branchName]); }
    async renameBranch(oldName: string, newName: string): Promise<void> { await this.exec(['branch', '-m', oldName, newName]); }
    async rebase(targetBranch: string): Promise<void> { await this.exec(['rebase', targetBranch]); }
    async merge(branch: string): Promise<void> { await this.exec(['merge', branch]); }
    async pushBranch(remote: string, branch: string): Promise<void> { await this.exec(['push', remote, branch]); }
    async fetchBranch(remote: string, branch: string): Promise<void> { await this.exec(['fetch', remote, branch]); }
    async fetchAll(): Promise<void> { await this.exec(['fetch', '--all']); }
    async pull(): Promise<void> { await this.exec(['pull']); }

    private trimmed: GitExec = (args, signal) => this.exec(args, signal);
    private raw: GitExec = (args, signal) => this.execRaw(args, signal);
}
