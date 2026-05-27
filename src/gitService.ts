import { execFile } from 'child_process';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const LOG_FIELD_SEP = '\x1f';
const LOG_RECORD_SEP = '\x1e';

const SEQUENCE_EDITOR_SCRIPT = `
const fs = require('fs');
const file = process.argv[2];
const actions = new Map(JSON.parse(process.env.LOOK_GIT_REBASE_ACTIONS || '[]'));
const lines = fs.readFileSync(file, 'utf8').split(/\\r?\\n/);
const next = lines.map((line) => {
  const match = line.match(/^([a-z]+)(\\s+)([0-9a-f]+)(\\s.*)$/i);
  if (!match) { return line; }
  const [, , spacing, todoHash, rest] = match;
  for (const [targetHash, action] of actions) {
    if (targetHash.startsWith(todoHash) || todoHash.startsWith(targetHash)) {
      return action + spacing + todoHash + rest;
    }
  }
  return line;
});
fs.writeFileSync(file, next.join('\\n'));
`;

const MESSAGE_EDITOR_SCRIPT = `
const fs = require('fs');
const file = process.argv[2];
fs.writeFileSync(file, (process.env.LOOK_GIT_COMMIT_MESSAGE || '') + '\\n');
`;

export interface GitCommitInfo {
    hash: string;
    shortHash: string;
    message: string;
    authorName: string;
    authorEmail: string;
    authorDate: Date;
    parentHashes: string[];
}

export type ResetMode = 'soft' | 'mixed' | 'hard';

export type GitFileStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U';

export interface GitFileChange {
    status: GitFileStatus;
    filePath: string;
    origPath?: string;
    parentHash?: string;
}

export interface GitStatusEntry {
    indexStatus: string;
    workTreeStatus: string;
    filePath: string;
    origPath?: string;
}

export interface StashEntry {
    index: number;
    message: string;
}

export interface BranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
    hash: string;
    upstream?: string;
}

export interface TagInfo {
    name: string;
    hash: string;
}

export interface GraphCommitInfo extends GitCommitInfo {
    refs: string[];
}

export interface GraphLogFilters {
    search?: string;
    authors?: string[];
    dateFrom?: string;
    dateTo?: string;
}

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

        return this.parseCommitLog(output);
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

        return this.parseCommitLog(output);
    }

    private parseCommitLog(output: string): GitCommitInfo[] {
        return output.split(LOG_RECORD_SEP)
            .map((record) => record.replace(/^\n/, '').replace(/\n$/, ''))
            .filter(Boolean)
            .map((record) => {
                const parts = record.split(LOG_FIELD_SEP);
                return {
                    hash: parts[0],
                    shortHash: parts[1],
                    message: parts[2],
                    authorName: parts[3],
                    authorEmail: parts[4],
                    authorDate: new Date(parts[5]),
                    parentHashes: parts[6] ? parts[6].split(' ') : [],
                };
            });
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

    public async revert(commitHash: string): Promise<string> {
        return this.exec(['revert', commitHash]);
    }

    public async dropCommit(commitHash: string): Promise<string> {
        return this.dropCommits([commitHash]);
    }

    public async dropCommits(commitHashes: string[]): Promise<string> {
        // Find the oldest commit by asking git for the topological order
        const oldestHash = await this.findOldestCommit(commitHashes);

        return this.runInteractiveRebase(
            oldestHash,
            commitHashes.map((h) => [h, 'drop'])
        );
    }

    public async renameCommit(commitHash: string, newMessage: string): Promise<string> {
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

    public async checkoutDetached(commitHash: string): Promise<string> {
        return this.exec(['checkout', '--detach', commitHash]);
    }

    public async checkoutNewBranch(branchName: string, startPoint: string): Promise<string> {
        return this.exec(['checkout', '-b', branchName, startPoint]);
    }

    public async squashCommits(oldestCommitHash: string, commitHashes: string[]): Promise<string> {
        // Change "pick" to "squash" for all commits except the oldest one
        return this.runInteractiveRebase(
            oldestCommitHash,
            commitHashes.map((h) => [h, 'squash'])
        );
    }

    public async fixupCommit(commitHash: string, targetCommitHash: string): Promise<string> {
        // Change "pick" to "fixup" for the commit to fold into its predecessor
        return this.runInteractiveRebase(targetCommitHash, [[commitHash, 'fixup']]);
    }

    public async pushUpTo(commitHash: string, remoteName: string, branchName: string): Promise<string> {
        return this.exec(['push', remoteName, `${commitHash}:refs/heads/${branchName}`]);
    }

    public async getRemotes(): Promise<string[]> {
        const output = await this.execReadonly(['remote']);
        if (!output) {
            return [];
        }
        return output.split('\n');
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        const parents = await this.getParentHashes(commitHash);

        if (parents.length === 0) {
            const output = await this.execRawReadonly([
                'diff-tree', '--root', '--no-commit-id', '-r', '-M', '--name-status', '-z', commitHash,
            ]);
            return output ? this.parseNameStatusZ(output) : [];
        }

        const result: GitFileChange[] = [];
        const seen = new Set<string>();
        for (const parentHash of parents) {
            const output = await this.execRawReadonly([
                'diff-tree', '--no-commit-id', '-r', '-M', '--name-status', '-z', parentHash, commitHash,
            ]);
            for (const change of this.parseNameStatusZ(output, parentHash)) {
                const key = `${parentHash}:${change.filePath}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(change);
                }
            }
        }

        return result;
    }

    private async getParentHashes(commitHash: string): Promise<string[]> {
        const output = await this.execReadonly(['rev-list', '--parents', '-n', '1', commitHash]);
        const [, ...parents] = output.split(/\s+/);
        return parents;
    }

    private parseNameStatusZ(output: string, parentHash?: string): GitFileChange[] {
        const seen = new Set<string>();
        const result: GitFileChange[] = [];
        const tokens = output.split('\0');

        for (let i = 0; i < tokens.length;) {
            const statusToken = tokens[i++];
            if (!statusToken) {
                continue;
            }
            const status = statusToken.charAt(0) as GitFileStatus;
            let origPath: string | undefined;
            let filePath = tokens[i++];

            if ((status === 'R' || status === 'C') && filePath) {
                origPath = filePath;
                filePath = tokens[i++];
            }

            // Deduplicate (merge commits can list files multiple times)
            if (filePath && !seen.has(filePath)) {
                seen.add(filePath);
                result.push({ status, filePath, origPath, parentHash });
            }
        }

        return result;
    }

    public getWorkingDirectory(): string {
        return this.cwd;
    }

    public async getAllBranches(): Promise<BranchInfo[]> {
        const FORMAT = [
            '%(refname)',
            '%(objectname:short)',
            '%(upstream:short)',
        ].join('%00');

        const [output, currentBranch] = await Promise.all([
            this.execRawReadonly(['for-each-ref', `--format=${FORMAT}`, 'refs/heads', 'refs/remotes']),
            this.getCurrentBranch().catch(() => 'HEAD'),
        ]);

        if (!output) {
            return [];
        }

        return output.split('\n').filter(Boolean).flatMap((line) => {
            const parts = line.split('\0');
            const refName = parts[0];
            const isRemote = refName.startsWith('refs/remotes/');
            if (isRemote && refName.endsWith('/HEAD')) {
                return [];
            }
            const name = isRemote
                ? refName.replace(/^refs\/remotes\//, '')
                : refName.replace(/^refs\/heads\//, '');

            return {
                name,
                isCurrent: !isRemote && name === currentBranch,
                hash: parts[1],
                upstream: parts[2] || undefined,
                isRemote,
            };
        });
    }

    public async getAllTags(): Promise<TagInfo[]> {
        const FORMAT = `%(refname:short)%00%(objectname:short)`;

        const output = await this.execRawReadonly([
            'tag', `--format=${FORMAT}`,
        ]);

        if (!output) {
            return [];
        }

        return output.split('\n').filter(Boolean).map((line) => {
            const parts = line.split('\0');
            return {
                name: parts[0],
                hash: parts[1],
            };
        });
    }

    public async getGraphLog(
        maxCount: number = 300,
        branches?: string[],
        pathFilter?: string,
        filters: GraphLogFilters = {},
    ): Promise<GraphCommitInfo[]> {
        const FORMAT = [
            '%H',   // full hash
            '%h',   // short hash
            '%s',   // subject
            '%an',  // author name
            '%ae',  // author email
            '%aI',  // author date ISO 8601
            '%P',   // parent hashes
            '%D',   // ref names
        ].join('%x1f') + '%x1e';

        const search = filters.search?.trim();
        const searchScanLimit = search
            ? Math.max(maxCount, Math.min(maxCount * 20, 5000))
            : maxCount;
        const args = [
            'log',
            `--format=${FORMAT}`,
            `--max-count=${searchScanLimit}`,
            '--topo-order',
        ];

        const authors = filters.authors?.map((author) => author.trim()).filter(Boolean) ?? [];
        const dateFrom = filters.dateFrom?.trim();
        const dateTo = filters.dateTo?.trim();

        if (dateFrom) {
            args.push(`--since=${dateFrom}T00:00:00`);
        }
        if (dateTo) {
            args.push(`--until=${dateTo}T23:59:59`);
        }
        for (const author of authors) {
            args.push(`--author=${author}`);
        }

        if (branches && branches.length > 0) {
            args.push(...branches);
        } else {
            args.push('--all');
        }
        if (pathFilter) {
            args.push('--', pathFilter);
        }

        const output = await this.execRawReadonly(args);

        if (!output) {
            return [];
        }

        let commits = output.split(LOG_RECORD_SEP)
            .map((record) => record.replace(/^\n/, '').replace(/\n$/, ''))
            .filter(Boolean)
            .map((record) => {
            const parts = record.split(LOG_FIELD_SEP);
            const refs = parts[7]
                ? parts[7].split(',').map((r) => r.trim()).filter(Boolean)
                : [];
            return {
                hash: parts[0],
                shortHash: parts[1],
                message: parts[2],
                authorName: parts[3],
                authorEmail: parts[4],
                authorDate: new Date(parts[5]),
                parentHashes: parts[6] ? parts[6].split(' ') : [],
                refs,
            };
        });

        if (search) {
            const normalizedSearch = search.toLowerCase();
            commits = commits.filter((commit) => this.commitMatchesGraphSearch(commit, normalizedSearch));
        }

        return commits.slice(0, maxCount);
    }

    private commitMatchesGraphSearch(commit: GraphCommitInfo, normalizedSearch: string): boolean {
        return commit.message.toLowerCase().includes(normalizedSearch)
            || commit.hash.toLowerCase().includes(normalizedSearch)
            || commit.shortHash.toLowerCase().includes(normalizedSearch)
            || commit.authorName.toLowerCase().includes(normalizedSearch)
            || commit.authorEmail.toLowerCase().includes(normalizedSearch);
    }

    public async getUserName(): Promise<string> {
        try {
            return (await this.execReadonly(['config', 'user.name'])).trim();
        } catch {
            return '';
        }
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

    public async getStatus(): Promise<{
        staged: GitStatusEntry[];
        unstaged: GitStatusEntry[];
        conflicts: GitStatusEntry[];
        conflictState: 'none' | 'merge' | 'rebase';
    }> {
        const output = await this.execRawReadonly(['status', '--porcelain=v1', '-z', '-u']);
        const staged: GitStatusEntry[] = [];
        const unstaged: GitStatusEntry[] = [];
        const conflicts: GitStatusEntry[] = [];

        if (!output) {
            const conflictState = await this.detectConflictState();
            return { staged, unstaged, conflicts, conflictState };
        }

        const conflictCodes = new Set(['U', 'A', 'D']);

        const tokens = output.split('\0');
        for (let i = 0; i < tokens.length;) {
            const line = tokens[i++];
            if (!line || line.length < 3) { continue; }

            const indexStatus = line[0];
            const workTreeStatus = line[1];
            let filePath = line.substring(3);
            let origPath: string | undefined;

            if (indexStatus === 'R' || indexStatus === 'C' || workTreeStatus === 'R' || workTreeStatus === 'C') {
                origPath = tokens[i++] || undefined;
            }

            const entry: GitStatusEntry = { indexStatus, workTreeStatus, filePath, origPath };

            // Unmerged: both sides have a conflict code (UU, AA, DD, AU, UA, DU, UD)
            const isConflict = indexStatus === 'U' || workTreeStatus === 'U'
                || (conflictCodes.has(indexStatus) && conflictCodes.has(workTreeStatus));

            if (isConflict) {
                conflicts.push(entry);
            } else {
                if (indexStatus !== ' ' && indexStatus !== '?') {
                    staged.push(entry);
                }
                if (workTreeStatus !== ' ' || indexStatus === '?') {
                    unstaged.push(entry);
                }
            }
        }

        const conflictState = await this.detectConflictState();
        return { staged, unstaged, conflicts, conflictState };
    }

    private async detectConflictState(): Promise<'none' | 'merge' | 'rebase'> {
        try {
            const gitDir = await this.getGitDir();
            if (fsSync.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
                return 'merge';
            }
            if (
                fsSync.existsSync(path.join(gitDir, 'rebase-merge'))
                || fsSync.existsSync(path.join(gitDir, 'rebase-apply'))
            ) {
                return 'rebase';
            }
        } catch {
            return 'none';
        }
        return 'none';
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
        try {
            const upstream = await this.execReadonly(['rev-parse', '--abbrev-ref', '@{upstream}']);
            const [remote, ...branchParts] = upstream.split('/');
            return { remote, branch: branchParts.join('/') };
        } catch {
            return undefined;
        }
    }

    public async stashList(): Promise<StashEntry[]> {
        try {
            const output = await this.execReadonly(['stash', 'list', '--format=%gd %s']);
            if (!output) { return []; }
            return output.split('\n').map((line) => {
                // Format: "stash@{0} WIP on main: abc1234 message"
                const match = line.match(/^stash@\{(\d+)\}\s+(.*)/);
                if (!match) { return { index: 0, message: line }; }
                return { index: parseInt(match[1], 10), message: match[2] };
            });
        } catch {
            return [];
        }
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
        const output = await this.execRawReadonly(['stash', 'show', '--name-status', '-M', '-z', `stash@{${index}}`]);
        if (!output) { return []; }
        return this.parseNameStatusZ(output);
    }
}
