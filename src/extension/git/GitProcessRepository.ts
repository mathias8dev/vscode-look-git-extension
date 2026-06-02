import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import type { GitExec, GitRepository, GraphLogFilters } from '../../core/git/GitRepository';
import type { GitCommit, GitGraphCommit, GitFileChange } from '../../core/git/domain/GitCommit';
import type { GitStatus, GitStash, GitBranch, GitTag } from '../../core/git/domain/GitStatus';
import type { GitWorktree, GitSubmodule } from '../../core/git/domain/GitWorktree';
import { queryStatus, querySubmodulePaths, queryStashList, queryStashFiles } from '../../core/queries/queryStatus';
import { queryGraphLog, queryCommitLog, queryAllBranches, queryAllTags, queryCurrentBranch, queryUserName, queryRemotes, queryCommitFiles, queryCommitMessage } from '../../core/queries/queryGraph';
import { queryWorktrees, addWorktree, removeWorktree } from '../../core/queries/queryWorktrees';
import { querySubmoduleStatus, updateSubmodule, updateAllSubmodules } from '../../core/queries/querySubmodules';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 10 * 1024 * 1024;
const MAX_LOCK_RETRIES = 5;

function isIndexLockError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr = typeof error === 'object' && error !== null
        && typeof (error as { stderr?: unknown }).stderr === 'string'
        ? (error as { stderr: string }).stderr : '';
    const combined = `${msg}\n${stderr}`;
    return combined.includes('index.lock')
        || (combined.includes('Unable to create') && combined.includes('File exists'));
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Concrete GitRepository — the ONLY file that calls child_process.execFile.
 * Delegates to pure query functions in src/core/queries/.
 */
export class GitProcessRepository implements GitRepository {
    constructor(public readonly cwd: string) {}

    // ── Low-level execution ───────────────────────────────────────────────

    async exec(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return (await this.run(args, undefined, signal)).trim();
    }

    async execRaw(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.run(args, undefined, signal);
    }

    async execWithEnv(args: readonly string[], env: Record<string, string>, signal?: AbortSignal): Promise<string> {
        return (await this.run(args, env, signal)).trim();
    }

    private async execReadonly(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return (await this.run(args, { GIT_OPTIONAL_LOCKS: '0' }, signal)).trim();
    }

    private async execRawReadonly(args: readonly string[], signal?: AbortSignal): Promise<string> {
        return this.run(args, { GIT_OPTIONAL_LOCKS: '0' }, signal);
    }

    private async run(args: readonly string[], env?: Record<string, string>, signal?: AbortSignal): Promise<string> {
        let delayMs = 80;
        for (let attempt = 0; ; attempt++) {
            signal?.throwIfAborted();
            try {
                const { stdout } = await execFileAsync('git', [...args], {
                    cwd: this.cwd, maxBuffer: MAX_BUFFER,
                    env: { ...process.env, ...env },
                    signal,
                });
                return stdout;
            } catch (error) {
                if (attempt >= MAX_LOCK_RETRIES || !isIndexLockError(error)) { throw error; }
                await sleep(delayMs);
                delayMs *= 2;
            }
        }
    }

    // ── Bound GitExec helpers (passed to query functions) ─────────────────

    private ro: GitExec = (a, s) => this.execReadonly(a, s);
    private roRaw: GitExec = (a, s) => this.execRawReadonly(a, s);
    private rw: GitExec = (a, s) => this.exec(a, s);

    // ── GitRepository implementation ──────────────────────────────────────

    async getGitDir(): Promise<string> {
        const gitDir = await this.exec(['rev-parse', '--git-dir']);
        return path.isAbsolute(gitDir) ? gitDir : path.resolve(this.cwd, gitDir);
    }

    getStatus(signal?: AbortSignal): Promise<GitStatus> {
        return queryStatus(this.roRaw, this.getGitDir.bind(this), signal);
    }
    getSubmodulePaths(signal?: AbortSignal): Promise<ReadonlySet<string>> {
        return querySubmodulePaths(this.roRaw, signal);
    }
    stashList(signal?: AbortSignal): Promise<readonly GitStash[]> {
        return queryStashList(this.ro, signal);
    }
    getStashFiles(index: number, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return queryStashFiles(this.roRaw, index, signal);
    }

    getLog(limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.roRaw, limit, skip, undefined, signal);
    }
    getLogForRef(ref: string, limit: number, skip: number, signal?: AbortSignal): Promise<readonly GitCommit[]> {
        return queryCommitLog(this.roRaw, limit, skip, ref, signal);
    }
    getGraphLog(maxCount: number, branches?: readonly string[], pathFilter?: string, filters?: GraphLogFilters, signal?: AbortSignal): Promise<readonly GitGraphCommit[]> {
        return queryGraphLog(this.roRaw, maxCount, branches, pathFilter, filters, signal);
    }
    getCommitFiles(commitHash: string, signal?: AbortSignal): Promise<readonly GitFileChange[]> {
        return queryCommitFiles(this.roRaw, commitHash, signal);
    }
    getCommitMessage(commitHash: string, signal?: AbortSignal): Promise<string> {
        return queryCommitMessage(this.ro, commitHash, signal);
    }

    getAllBranches(signal?: AbortSignal): Promise<readonly GitBranch[]> {
        return queryAllBranches(this.roRaw, (s) => this.getCurrentBranch(s), signal);
    }
    getAllTags(signal?: AbortSignal): Promise<readonly GitTag[]> {
        return queryAllTags(this.roRaw, signal);
    }
    getCurrentBranch(signal?: AbortSignal): Promise<string> {
        return queryCurrentBranch(this.ro, signal);
    }
    getUserName(signal?: AbortSignal): Promise<string> {
        return queryUserName(this.ro, signal);
    }
    getRemotes(signal?: AbortSignal): Promise<readonly string[]> {
        return queryRemotes(this.ro, signal);
    }

    listWorktrees(signal?: AbortSignal): Promise<readonly GitWorktree[]> {
        return queryWorktrees(this.roRaw, signal);
    }
    addWorktree(worktreePath: string, branch: string, createNew = false, signal?: AbortSignal): Promise<void> {
        return addWorktree(this.rw, worktreePath, branch, createNew, signal);
    }
    removeWorktree(worktreePath: string, force = false, signal?: AbortSignal): Promise<void> {
        return removeWorktree(this.rw, worktreePath, force, signal);
    }

    getSubmoduleStatus(signal?: AbortSignal): Promise<readonly GitSubmodule[]> {
        return querySubmoduleStatus(this.roRaw, signal);
    }
    updateSubmodule(submodulePath: string, signal?: AbortSignal): Promise<void> {
        return updateSubmodule(this.rw, submodulePath, signal);
    }
    updateAllSubmodules(signal?: AbortSignal): Promise<void> {
        return updateAllSubmodules(this.rw, signal);
    }

    // ── Mutations (write ops — no AbortSignal) ────────────────────────────

    async stageFile(filePath: string): Promise<void>   { await this.exec(['add', '--', filePath]); }
    async unstageFile(filePath: string): Promise<void>  { await this.exec(['reset', 'HEAD', '--', filePath]); }
    async stageAll(): Promise<void>                     { await this.exec(['add', '-A']); }
    async unstageAll(): Promise<void>                   { await this.exec(['reset', 'HEAD']); }
    async discardFile(filePath: string): Promise<void> {
        try { await this.exec(['checkout', '--', filePath]); }
        catch { await this.exec(['clean', '-f', '--', filePath]); }
    }
    async commit(message: string): Promise<void>        { await this.exec(['commit', '-m', message]); }
    async commitAmend(message: string): Promise<void>   { await this.exec(['commit', '--amend', '-m', message]); }
    async push(): Promise<void>                         { await this.exec(['push']); }
    async pullAndPush(): Promise<void>                  { await this.exec(['pull', '--rebase']); await this.exec(['push']); }
    async acceptOurs(filePath: string): Promise<void>   { await this.exec(['checkout', '--ours', '--', filePath]); }
    async acceptTheirs(filePath: string): Promise<void> { await this.exec(['checkout', '--theirs', '--', filePath]); }
    async mergeContinue(): Promise<void>                { await this.exec(['-c', 'core.editor=true', 'merge', '--continue']); }
    async mergeAbort(): Promise<void>                   { await this.exec(['merge', '--abort']); }
    async rebaseContinue(): Promise<void>               { await this.exec(['-c', 'core.editor=true', 'rebase', '--continue']); }
    async rebaseAbort(): Promise<void>                  { await this.exec(['rebase', '--abort']); }
    async stash(message?: string): Promise<void>        { await this.exec(message ? ['stash', 'push', '-m', message] : ['stash', 'push']); }
    async stashStaged(message?: string): Promise<void>  { await this.exec(message ? ['stash', 'push', '--staged', '-m', message] : ['stash', 'push', '--staged']); }
    async stashPop(index: number): Promise<void>        { await this.exec(['stash', 'pop', `stash@{${index}}`]); }
    async stashApply(index: number): Promise<void>      { await this.exec(['stash', 'apply', `stash@{${index}}`]); }
    async stashDrop(index: number): Promise<void>       { await this.exec(['stash', 'drop', `stash@{${index}}`]); }
    async checkout(ref: string): Promise<void>          { await this.exec(['checkout', ref]); }
    async checkoutNewBranch(name: string, start?: string): Promise<void> { await this.exec(start ? ['checkout', '-b', name, start] : ['checkout', '-b', name]); }
    async deleteBranch(name: string): Promise<void>     { await this.exec(['branch', '-D', name]); }
    async deleteRemoteBranch(remote: string, name: string): Promise<void> { await this.exec(['push', remote, '--delete', name]); }
    async renameBranch(old: string, next: string): Promise<void> { await this.exec(['branch', '-m', old, next]); }
    async rebase(target: string): Promise<void>         { await this.exec(['rebase', target]); }
    async merge(branch: string): Promise<void>          { await this.exec(['merge', branch]); }
    async pushBranch(remote: string, branch: string): Promise<void> { await this.exec(['push', remote, branch]); }
    async fetchBranch(remote: string, branch: string): Promise<void> { await this.exec(['fetch', remote, branch]); }
    async fetchAll(): Promise<void>                     { await this.exec(['fetch', '--all']); }
    async pull(): Promise<void>                         { await this.exec(['pull']); }
}
