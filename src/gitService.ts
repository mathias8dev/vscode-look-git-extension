import { execFile } from 'child_process';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { MESSAGE_EDITOR_SCRIPT, SEQUENCE_EDITOR_SCRIPT } from './gitEditorScripts';
import { parseCommitLog, parseNameStatusZ } from './gitParsers';
import {
    getAllBranches as queryAllBranches,
    getAllTags as queryAllTags,
    getGraphLog as queryGraphLog,
    getUserName as queryUserName,
} from './gitGraphQueries';
import {
    getStatus as queryStatus,
    getStashFiles as queryStashFiles,
    getTrackingBranch as queryTrackingBranch,
    listWorktrees as queryListWorktrees,
    getSubmodulePaths as querySubmodulePaths,
    stashList as queryStashList,
} from './gitWorkingTree';
import type {
    BranchInfo,
    GitCommitInfo,
    GitFileChange,
    GitStatus,
    GraphCommitInfo,
    GraphLogFilters,
    ResetMode,
    StashEntry,
    TagInfo,
    WorktreeInfo,
} from './gitTypes';

export type { BranchInfo, GitCommitInfo, GitFileChange, GitFileStatus, GitStatus, GitStatusEntry, GraphCommitInfo, GraphLogFilters, ResetMode, StashEntry, TagInfo, WorktreeInfo } from './gitTypes';

const execFileAsync = promisify(execFile);

export class GitService {
    private cwd: string;

    constructor(workingDirectory: string) {
        this.cwd = workingDirectory;
    }

    public setWorkingDirectory(cwd: string): void {
        this.cwd = cwd;
    }

    public async exec(args: string[], env?: Record<string, string>): Promise<string> {
        const stdout = await this.execGitWithRetry(args, env);
        return stdout.trim();
    }

    private async execRaw(args: string[], env?: Record<string, string>): Promise<string> {
        return this.execGitWithRetry(args, env);
    }

    private async execReadonly(args: string[], env?: Record<string, string>): Promise<string> {
        return this.exec(args, { GIT_OPTIONAL_LOCKS: '0', ...env });
    }

    private async execRawReadonly(args: string[], env?: Record<string, string>): Promise<string> {
        return this.execRaw(args, { GIT_OPTIONAL_LOCKS: '0', ...env });
    }

    private async execGitWithRetry(args: string[], env?: Record<string, string>): Promise<string> {
        let delayMs = 80;
        for (let attempt = 0; ; attempt++) {
            try {
                const { stdout } = await execFileAsync('git', args, {
                    cwd: this.cwd,
                    maxBuffer: 10 * 1024 * 1024,
                    env: { ...process.env, ...env },
                });
                return stdout;
            } catch (error) {
                if (attempt >= 5 || !this.isIndexLockError(error)) {
                    throw error;
                }
                await this.sleep(delayMs);
                delayMs *= 2;
            }
        }
    }

    private isIndexLockError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        const stderr = typeof error === 'object'
            && error !== null
            && typeof (error as { stderr?: unknown }).stderr === 'string'
            ? (error as { stderr: string }).stderr
            : '';
        const combined = `${message}\n${stderr}`;
        return combined.includes('index.lock')
            || (combined.includes('Unable to create') && combined.includes('File exists'));
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async runInteractiveRebase(
        baseCommitHash: string,
        actions: [string, string][],
        env: Record<string, string> = {},
        messageEditorScript?: string
    ): Promise<string> {
        const sequenceEditor = await this.writeTempEditor(SEQUENCE_EDITOR_SCRIPT);
        const messageEditorPath = messageEditorScript
            ? await this.writeTempEditor(messageEditorScript)
            : undefined;

        try {
            const args = await this.getInteractiveRebaseArgs(baseCommitHash);
            const editorEnv: Record<string, string> = {
                ...env,
                LOOK_GIT_REBASE_ACTIONS: JSON.stringify(actions),
                GIT_SEQUENCE_EDITOR: sequenceEditor.command,
            };
            if (messageEditorPath) {
                editorEnv.GIT_EDITOR = messageEditorPath.command;
            } else {
                editorEnv.GIT_EDITOR = 'true';
            }
            return await this.exec(args, editorEnv);
        } finally {
            await sequenceEditor.dispose();
            if (messageEditorPath) {
                await messageEditorPath.dispose();
            }
        }
    }

    private async getInteractiveRebaseArgs(baseCommitHash: string): Promise<string[]> {
        const output = await this.execReadonly(['rev-list', '--parents', '-n', '1', baseCommitHash]);
        const [, ...parents] = output.split(/\s+/);
        return parents.length > 0
            ? ['rebase', '-i', `${baseCommitHash}~1`]
            : ['rebase', '-i', '--root'];
    }

    private async writeTempEditor(contents: string): Promise<{ command: string; dispose: () => Promise<void> }> {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'look-git-'));
        const scriptPath = path.join(dir, 'editor.js');
        await fs.writeFile(scriptPath, contents, 'utf8');
        const isWindows = process.platform === 'win32';
        const wrapperPath = path.join(dir, isWindows ? 'editor.cmd' : 'editor.sh');
        const wrapper = isWindows
            ? `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`
            : `#!/bin/sh\n'${process.execPath.replace(/'/g, "'\\''")}' '${scriptPath.replace(/'/g, "'\\''")}' "$@"\n`;
        await fs.writeFile(wrapperPath, wrapper, 'utf8');
        if (!isWindows) {
            await fs.chmod(wrapperPath, 0o700);
        }
        return {
            command: this.quoteCommandArg(wrapperPath),
            dispose: async () => {
                await fs.rm(dir, { recursive: true, force: true });
            },
        };
    }

    private quoteCommandArg(arg: string): string {
        return `"${arg.replace(/"/g, '\\"')}"`;
    }

    public async getLog(maxCount: number = 50, skip: number = 0): Promise<GitCommitInfo[]> {
        const FORMAT = [
            '%H',   // full hash
            '%h',   // short hash
            '%s',   // subject
            '%an',  // author name
            '%ae',  // author email
            '%aI',  // author date ISO 8601
            '%P',   // parent hashes
        ].join('%x1f') + '%x1e';

        const output = await this.execRawReadonly([
            'log',
            `--format=${FORMAT}`,
            `--max-count=${maxCount}`,
            `--skip=${skip}`,
        ]);

        if (!output) {
            return [];
        }

        return parseCommitLog(output);
    }

    public async getCommit(commitHash: string): Promise<GitCommitInfo | undefined> {
        const commits = await this.getLogForRefs(1, 0, [commitHash]);
        return commits[0];
    }

    private async getLogForRefs(maxCount: number, skip: number, refs: string[]): Promise<GitCommitInfo[]> {
        const FORMAT = [
            '%H',
            '%h',
            '%s',
            '%an',
            '%ae',
            '%aI',
            '%P',
        ].join('%x1f') + '%x1e';

        const output = await this.execRawReadonly([
            'log',
            `--format=${FORMAT}`,
            `--max-count=${maxCount}`,
            `--skip=${skip}`,
            ...refs,
        ]);

        if (!output) {
            return [];
        }

        return parseCommitLog(output);
    }

    public async cherryPick(commitHash: string): Promise<string> {
        return this.exec(['cherry-pick', commitHash]);
    }

    public async rebase(ontoCommitHash: string): Promise<string> {
        return this.exec(['rebase', ontoCommitHash]);
    }

    public async rebaseAbort(): Promise<string> {
        return this.exec(['rebase', '--abort']);
    }

    public async rebaseContinue(): Promise<string> {
        return this.exec(['rebase', '--continue'], { GIT_EDITOR: 'true' });
    }

    public async mergeAbort(): Promise<string> {
        try {
            return await this.exec(['merge', '--abort']);
        } catch {
            return this.exec(['reset', '--merge']);
        }
    }

    public async mergeContinue(): Promise<string> {
        return this.exec(['merge', '--continue'], { GIT_EDITOR: 'true' });
    }

    public async acceptOurs(filePath: string): Promise<string> {
        return this.exec(['checkout', '--ours', '--', filePath]);
    }

    public async acceptTheirs(filePath: string): Promise<string> {
        return this.exec(['checkout', '--theirs', '--', filePath]);
    }

    public async reset(commitHash: string, mode: ResetMode): Promise<string> {
        return this.exec(['reset', `--${mode}`, commitHash]);
    }

    public async undoLastCommit(): Promise<string> {
        return this.exec(['reset', '--soft', 'HEAD~1']);
    }

    public async revert(commitHash: string): Promise<string> {
        return this.exec(['revert', commitHash]);
    }

    public async dropCommit(commitHash: string): Promise<string> {
        return this.dropCommits([commitHash]);
    }

    public async dropCommits(commitHashes: string[]): Promise<string> {
        await this.assertCommitsAreAncestorsOfHead(commitHashes, 'Drop commits');
        // Find the oldest commit by asking git for the topological order
        const oldestHash = await this.findOldestCommit(commitHashes);

        return this.runInteractiveRebase(
            oldestHash,
            commitHashes.map((h) => [h, 'drop'])
        );
    }

    public async renameCommit(commitHash: string, newMessage: string): Promise<string> {
        await this.assertCommitsAreAncestorsOfHead([commitHash], 'Rename commit');
        return this.runInteractiveRebase(
            commitHash,
            [[commitHash, 'reword']],
            { LOOK_GIT_COMMIT_MESSAGE: newMessage },
            MESSAGE_EDITOR_SCRIPT
        );
    }

    public async amendMessage(newMessage: string): Promise<string> {
        return this.exec(['commit', '--amend', '-m', newMessage]);
    }

    public async isRebaseInProgress(): Promise<boolean> {
        try {
            const gitDir = await this.getGitDir();
            return fsSync.existsSync(path.join(gitDir, 'rebase-merge'))
                || fsSync.existsSync(path.join(gitDir, 'rebase-apply'));
        } catch {
            return false;
        }
    }

    public async isMergeInProgress(): Promise<boolean> {
        try {
            const gitDir = await this.getGitDir();
            return fsSync.existsSync(path.join(gitDir, 'MERGE_HEAD'));
        } catch {
            return false;
        }
    }

    private async getGitDir(): Promise<string> {
        const output = await this.execReadonly(['rev-parse', '--git-dir']);
        return path.resolve(this.cwd, output);
    }

    public async findOldestCommit(commitHashes: string[]): Promise<string> {
        // Use git log to find which commit comes last (is oldest) in history
        const output = await this.execReadonly(['rev-list', '--topo-order', '--reverse', 'HEAD']);

        if (!output) {
            return commitHashes[commitHashes.length - 1];
        }

        const logHashes = output.split('\n');
        const hashSet = new Set(commitHashes);

        // Walk from oldest to newest; the first match is the oldest selected commit
        for (const h of logHashes) {
            if (hashSet.has(h)) {
                return h;
            }
        }

        return commitHashes[commitHashes.length - 1];
    }

    public async getHeadCommitHashes(maxCount?: number): Promise<string[]> {
        const args = ['rev-list'];
        if (typeof maxCount === 'number' && Number.isFinite(maxCount) && maxCount > 0) {
            args.push(`--max-count=${Math.floor(maxCount)}`);
        }
        args.push('HEAD');
        const output = await this.execReadonly(args);
        return output ? output.split('\n').filter(Boolean) : [];
    }

    public async isAncestorOfHead(commitHash: string): Promise<boolean> {
        try {
            await this.execReadonly(['merge-base', '--is-ancestor', commitHash, 'HEAD']);
            return true;
        } catch {
            return false;
        }
    }

    public async hasUncommittedChanges(): Promise<boolean> {
        const output = await this.execReadonly(['status', '--porcelain']);
        return output.length > 0;
    }

    public async getCurrentBranch(): Promise<string> {
        return this.execReadonly(['rev-parse', '--abbrev-ref', 'HEAD']);
    }

    public async getCommitMessage(commitHash: string): Promise<string> {
        return this.execReadonly(['log', '-1', '--format=%B', commitHash]);
    }

    public async checkout(ref: string): Promise<string> {
        return this.exec(['checkout', ref]);
    }

    public async checkoutRemoteBranch(remoteBranch: string): Promise<string> {
        const slashIdx = remoteBranch.indexOf('/');
        if (slashIdx === -1) {
            return this.checkout(remoteBranch);
        }

        const localBranch = remoteBranch.substring(slashIdx + 1);
        if (await this.localBranchExists(localBranch)) {
            return this.checkout(localBranch);
        }

        return this.exec(['checkout', '--track', remoteBranch]);
    }

    public async checkoutDetached(commitHash: string): Promise<string> {
        return this.exec(['checkout', '--detach', commitHash]);
    }

    public async checkoutNewBranch(branchName: string, startPoint: string): Promise<string> {
        return this.exec(['checkout', '-b', branchName, startPoint]);
    }

    public async createDetachedWorktree(worktreePath: string, commitHash: string): Promise<string> {
        return this.exec(['worktree', 'add', '--detach', worktreePath, commitHash]);
    }

    public async listWorktrees(): Promise<WorktreeInfo[]> {
        return queryListWorktrees(this.execRawReadonly.bind(this));
    }

    public async addWorktree(worktreePath: string, branch: string, createNew = false): Promise<string> {
        const args = createNew
            ? ['worktree', 'add', '-b', branch, worktreePath]
            : ['worktree', 'add', worktreePath, branch];
        return this.exec(args);
    }

    public async removeWorktree(worktreePath: string, force = false): Promise<string> {
        const args: string[] = ['worktree', 'remove', worktreePath];
        if (force) { args.push('--force'); }
        return this.exec(args);
    }

    public async getSubmodulePaths(): Promise<Set<string>> {
        return querySubmodulePaths(this.execRawReadonly.bind(this));
    }

    private async localBranchExists(branchName: string): Promise<boolean> {
        try {
            await this.execReadonly(['show-ref', '--verify', `refs/heads/${branchName}`]);
            return true;
        } catch {
            return false;
        }
    }

    public async squashCommits(oldestCommitHash: string, commitHashes: string[], message?: string): Promise<string> {
        await this.assertCommitsAreAncestorsOfHead([oldestCommitHash, ...commitHashes], 'Squash commits');
        // Change "pick" to "squash" for all commits except the oldest one
        return this.runInteractiveRebase(
            oldestCommitHash,
            commitHashes.map((h) => [h, 'squash']),
            message ? { LOOK_GIT_COMMIT_MESSAGE: message } : {},
            message ? MESSAGE_EDITOR_SCRIPT : undefined
        );
    }

    public async fixupCommit(commitHash: string, targetCommitHash: string): Promise<string> {
        await this.assertCommitsAreAncestorsOfHead([commitHash, targetCommitHash], 'Fixup commit');
        // Change "pick" to "fixup" for the commit to fold into its predecessor
        return this.runInteractiveRebase(targetCommitHash, [[commitHash, 'fixup']]);
    }

    public async pushUpTo(commitHash: string, remoteName: string, branchName: string): Promise<string> {
        await this.assertCommitsAreAncestorsOfHead([commitHash], 'Push up to commit');
        return this.exec(['push', remoteName, `${commitHash}:refs/heads/${branchName}`]);
    }

    public async getRemotes(): Promise<string[]> {
        const output = await this.execReadonly(['remote']);
        if (!output) {
            return [];
        }
        return output.split('\n');
    }

    public async getRemoteUrl(remoteName?: string): Promise<string | undefined> {
        const remotes = await this.getRemotes();
        const remote = remoteName ?? (remotes.includes('origin') ? 'origin' : remotes[0]);
        if (!remote) {
            return undefined;
        }
        return this.execReadonly(['remote', 'get-url', remote]);
    }

    public async createPatch(commitHash: string): Promise<string> {
        return this.execRawReadonly(['format-patch', '-1', '--stdout', commitHash]);
    }

    public async getFilesChangedFrom(commitHash: string): Promise<GitFileChange[]> {
        const output = await this.execRawReadonly(['diff', '--name-status', '-z', commitHash, '--']);
        return output ? parseNameStatusZ(output) : [];
    }

    public async createTag(tagName: string, commitHash: string): Promise<string> {
        return this.exec(['tag', tagName, commitHash]);
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        const parents = await this.getParentHashes(commitHash);
        const submodulePaths = await this.getGitlinkPaths(parents, commitHash);

        if (parents.length === 0) {
            const output = await this.execRawReadonly([
                'diff-tree', '--root', '--no-commit-id', '-r', '-M', '--name-status', '-z', commitHash,
            ]);
            const files = output ? parseNameStatusZ(output) : [];
            return files.map((f) => submodulePaths.has(f.filePath) ? { ...f, isSubmodule: true } : f);
        }

        const result: GitFileChange[] = [];
        const seen = new Set<string>();
        for (const parentHash of parents) {
            const output = await this.execRawReadonly([
                'diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', parentHash, commitHash,
            ]);
            for (const change of parseNameStatusZ(output, parentHash)) {
                const key = `${parentHash}:${change.filePath}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(submodulePaths.has(change.filePath) ? { ...change, isSubmodule: true } : change);
                }
            }
        }

        return result;
    }

    private async getGitlinkPaths(parents: string[], commitHash: string): Promise<Set<string>> {
        try {
            // Use --raw to get file modes; mode 160000 = gitlink (submodule)
            const args = parents.length === 0
                ? ['diff-tree', '--root', '--no-commit-id', '-r', '--raw', '-z', commitHash]
                : ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', parents[0], commitHash];
            const raw = await this.execRawReadonly(args);
            if (!raw) { return new Set(); }
            const paths = new Set<string>();
            // Format per entry: ":oldmode newmode oldsha newsha status\0path\0"
            const tokens = raw.split('\0');
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                if (!token.startsWith(':')) { continue; }
                const parts = token.split(' ');
                const newMode = parts[1];
                if (newMode === '160000') {
                    const filePath = tokens[++i];
                    if (filePath) { paths.add(filePath); }
                }
            }
            return paths;
        } catch {
            return new Set();
        }
    }

    private async getParentHashes(commitHash: string): Promise<string[]> {
        const output = await this.execReadonly(['rev-list', '--parents', '-n', '1', commitHash]);
        const [, ...parents] = output.split(/\s+/);
        return parents;
    }

    public getWorkingDirectory(): string {
        return this.cwd;
    }

    public async getAllBranches(): Promise<BranchInfo[]> {
        return queryAllBranches(
            this.execRawReadonly.bind(this),
            this.getCurrentBranch.bind(this),
        );
    }

    public async getAllTags(): Promise<TagInfo[]> {
        return queryAllTags(this.execRawReadonly.bind(this));
    }

    public async getGraphLog(
        maxCount: number = 300,
        branches?: string[],
        pathFilter?: string,
        filters: GraphLogFilters = {},
    ): Promise<GraphCommitInfo[]> {
        return queryGraphLog(this.execRawReadonly.bind(this), maxCount, branches, pathFilter, filters);
    }

    public async getUserName(): Promise<string> {
        return queryUserName(this.execReadonly.bind(this));
    }

    public async deleteBranch(branchName: string, force?: boolean): Promise<string> {
        return this.exec(['branch', force ? '-D' : '-d', branchName]);
    }

    public async deleteRemoteBranch(remote: string, branchName: string): Promise<string> {
        return this.exec(['push', remote, '--delete', branchName]);
    }

    public async renameBranch(oldName: string, newName: string): Promise<string> {
        return this.exec(['branch', '-m', oldName, newName]);
    }

    public async merge(ref: string): Promise<string> {
        return this.exec(['merge', ref]);
    }

    public async pushBranch(remote: string, branchName: string): Promise<string> {
        return this.exec(['push', '-u', remote, branchName]);
    }

    public async fetchBranch(remote: string, branchName: string): Promise<string> {
        return this.exec(['fetch', remote, branchName]);
    }

    public async getStatus(): Promise<GitStatus> {
        return queryStatus(
            this.execRawReadonly.bind(this),
            this.getGitDir.bind(this),
        );
    }

    public async stageFile(filePath: string): Promise<string> {
        return this.exec(['add', '--', filePath]);
    }

    public async stageAll(): Promise<string> {
        return this.exec(['add', '-A']);
    }

    public async unstageFile(filePath: string): Promise<string> {
        try {
            return await this.exec(['restore', '--staged', '--', filePath]);
        } catch {
            return this.exec(['reset', '-q', 'HEAD', '--', filePath]);
        }
    }

    public async unstageAll(): Promise<string> {
        try {
            return await this.exec(['restore', '--staged', '.']);
        } catch {
            return this.exec(['reset', '-q', 'HEAD', '--', '.']);
        }
    }

    public async discardFile(filePath: string): Promise<string> {
        try {
            return await this.exec(['restore', '--', filePath]);
        } catch {
            return this.exec(['clean', '-f', '--', filePath]);
        }
    }

    public async commit(message: string): Promise<string> {
        return this.exec(['commit', '-m', message]);
    }

    public async commitAmend(message: string): Promise<string> {
        return this.exec(['commit', '--amend', '-m', message]);
    }

    public async fetchAll(): Promise<string> {
        return this.exec(['fetch', '--all']);
    }

    public async pull(): Promise<string> {
        return this.exec(['pull']);
    }

    public async push(): Promise<string> {
        return this.exec(['push']);
    }

    public async pullAndPush(): Promise<string> {
        await this.exec(['pull']);
        return this.exec(['push']);
    }

    public async getTrackingBranch(): Promise<{ remote: string; branch: string } | undefined> {
        return queryTrackingBranch(this.execReadonly.bind(this));
    }

    public async stashList(): Promise<StashEntry[]> {
        return queryStashList(this.execReadonly.bind(this));
    }

    public async stash(message?: string): Promise<string> {
        const args = ['stash', 'push', '--include-untracked'];
        if (message) { args.push('-m', message); }
        return this.exec(args);
    }

    public async stashStaged(message?: string): Promise<string> {
        const args = ['stash', 'push', '--staged'];
        if (message) { args.push('-m', message); }
        return this.exec(args);
    }

    public async stashPop(index: number = 0): Promise<string> {
        return this.exec(['stash', 'pop', `stash@{${index}}`]);
    }

    public async stashApply(index: number = 0): Promise<string> {
        return this.exec(['stash', 'apply', `stash@{${index}}`]);
    }

    public async stashDrop(index: number = 0): Promise<string> {
        return this.exec(['stash', 'drop', `stash@{${index}}`]);
    }

    public async getStashFiles(index: number): Promise<GitFileChange[]> {
        return queryStashFiles(this.execRawReadonly.bind(this), index);
    }

    private async assertCommitsAreAncestorsOfHead(commitHashes: string[], operationName: string): Promise<void> {
        const currentBranch = await this.getCurrentBranch().catch(() => 'HEAD');
        if (!currentBranch || currentBranch === 'HEAD') {
            throw new Error(`${operationName} requires a checked-out branch. The repository is currently in detached HEAD.`);
        }

        for (const hash of commitHashes) {
            if (!(await this.isAncestorOfHead(hash))) {
                throw new Error(`${operationName} is only available for commits reachable from the current HEAD: ${hash.substring(0, 12)}`);
            }
        }
    }
}
