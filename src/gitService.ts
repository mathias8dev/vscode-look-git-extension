import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

export class GitService {
    private cwd: string;

    constructor(workingDirectory: string) {
        this.cwd = workingDirectory;
    }

    public setWorkingDirectory(cwd: string): void {
        this.cwd = cwd;
    }

    public async exec(args: string[], env?: Record<string, string>): Promise<string> {
        const { stdout } = await execFileAsync('git', args, {
            cwd: this.cwd,
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env, ...env },
        });
        return stdout.trim();
    }

    public async getLog(maxCount: number = 50, skip: number = 0): Promise<GitCommitInfo[]> {
        const SEP = '<<SEP>>';
        const FORMAT = [
            '%H',   // full hash
            '%h',   // short hash
            '%s',   // subject
            '%an',  // author name
            '%ae',  // author email
            '%aI',  // author date ISO 8601
            '%P',   // parent hashes
        ].join(SEP);

        const output = await this.exec([
            'log',
            `--format=${FORMAT}`,
            `--max-count=${maxCount}`,
            `--skip=${skip}`,
        ]);

        if (!output) {
            return [];
        }

        return output.split('\n').map((line) => {
            const parts = line.split(SEP);
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

        const sedCommands = commitHashes
            .map((h) => `s/^pick ${h.substring(0, 7)}/drop ${h.substring(0, 7)}/`)
            .join(';');
        const sedCommand = `sed -i '${sedCommands}'`;

        return this.exec(
            ['rebase', '-i', `${oldestHash}~1`],
            { GIT_SEQUENCE_EDITOR: sedCommand }
        );
    }

    public async renameCommit(commitHash: string, newMessage: string): Promise<string> {
        const shortHash = commitHash.substring(0, 7);
        const sedCommand = `sed -i 's/^pick ${shortHash}/reword ${shortHash}/'`;

        // Escape single quotes in the message for shell safety
        const escapedMessage = newMessage.replace(/'/g, "'\\''");
        const editorScript = `printf '%s\\n' '${escapedMessage}' >`;

        return this.exec(
            ['rebase', '-i', `${commitHash}~1`],
            {
                GIT_SEQUENCE_EDITOR: sedCommand,
                GIT_EDITOR: editorScript,
            }
        );
    }

    public async amendMessage(newMessage: string): Promise<string> {
        return this.exec(['commit', '--amend', '-m', newMessage]);
    }

    public async isRebaseInProgress(): Promise<boolean> {
        try {
            // Check for rebase-merge or rebase-apply directories
            const output = await this.exec(['rev-parse', '--git-dir']);
            const fs = await import('fs');
            const path = await import('path');
            const gitDir = path.resolve(this.cwd, output);
            return fs.existsSync(path.join(gitDir, 'rebase-merge'))
                || fs.existsSync(path.join(gitDir, 'rebase-apply'));
        } catch {
            return false;
        }
    }

    public async findOldestCommit(commitHashes: string[]): Promise<string> {
        // Use git log to find which commit comes last (is oldest) in history
        // rev-list outputs in reverse chronological order, so the last match is oldest
        const hashArgs = commitHashes.map((h) => h.substring(0, 7));
        const output = await this.exec([
            'log', '--format=%H', '--reverse',
            `${commitHashes[0]}~1...HEAD`,
        ]);

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
        const output = await this.exec(['status', '--porcelain']);
        return output.length > 0;
    }

    public async getCurrentBranch(): Promise<string> {
        return this.exec(['rev-parse', '--abbrev-ref', 'HEAD']);
    }

    public async getCommitMessage(commitHash: string): Promise<string> {
        return this.exec(['log', '-1', '--format=%B', commitHash]);
    }

    public async checkout(ref: string): Promise<string> {
        return this.exec(['checkout', ref]);
    }

    public async checkoutNewBranch(branchName: string, startPoint: string): Promise<string> {
        return this.exec(['checkout', '-b', branchName, startPoint]);
    }

    public async squashCommits(oldestCommitHash: string, commitHashes: string[]): Promise<string> {
        // Change "pick" to "squash" for all commits except the oldest one
        const sedCommands = commitHashes
            .map((h) => `s/^pick ${h.substring(0, 7)}/squash ${h.substring(0, 7)}/`)
            .join(';');
        const sedCommand = `sed -i '${sedCommands}'`;

        return this.exec(
            ['rebase', '-i', `${oldestCommitHash}~1`],
            { GIT_SEQUENCE_EDITOR: sedCommand }
        );
    }

    public async fixupCommit(commitHash: string, targetCommitHash: string): Promise<string> {
        // Change "pick" to "fixup" for the commit to fold into its predecessor
        const shortHash = commitHash.substring(0, 7);
        const sedCommand = `sed -i 's/^pick ${shortHash}/fixup ${shortHash}/'`;

        return this.exec(
            ['rebase', '-i', `${targetCommitHash}~1`],
            { GIT_SEQUENCE_EDITOR: sedCommand }
        );
    }

    public async pushUpTo(commitHash: string, remoteName: string, branchName: string): Promise<string> {
        return this.exec(['push', remoteName, `${commitHash}:refs/heads/${branchName}`]);
    }

    public async getRemotes(): Promise<string[]> {
        const output = await this.exec(['remote']);
        if (!output) {
            return [];
        }
        return output.split('\n');
    }

    public async getCommitFiles(commitHash: string): Promise<GitFileChange[]> {
        // Use --root so the initial commit (no parent) also shows its files
        // Use -m so merge commits show changes against each parent
        const output = await this.exec([
            'diff-tree', '--root', '--no-commit-id', '-r', '-m', '--name-status', commitHash,
        ]);

        if (!output) {
            return [];
        }

        const seen = new Set<string>();
        const result: GitFileChange[] = [];

        for (const line of output.split('\n')) {
            if (!line || !line.includes('\t')) {
                continue;
            }
            const [status, ...fileParts] = line.split('\t');
            const filePath = fileParts.join('\t');
            // Deduplicate (merge commits can list files multiple times)
            if (filePath && !seen.has(filePath)) {
                seen.add(filePath);
                result.push({ status: status.charAt(0) as GitFileStatus, filePath });
            }
        }

        return result;
    }

    public getWorkingDirectory(): string {
        return this.cwd;
    }

    public async getAllBranches(): Promise<BranchInfo[]> {
        const SEP = '<<SEP>>';
        const FORMAT = [
            '%(refname:short)',
            '%(HEAD)',
            '%(objectname:short)',
            '%(upstream:short)',
        ].join(SEP);

        const output = await this.exec([
            'branch', '-a', `--format=${FORMAT}`,
        ]);

        if (!output) {
            return [];
        }

        return output.split('\n').map((line) => {
            const parts = line.split(SEP);
            return {
                name: parts[0],
                isCurrent: parts[1] === '*',
                hash: parts[2],
                upstream: parts[3] || undefined,
                isRemote: parts[0].startsWith('origin/') || parts[0].includes('/'),
            };
        });
    }

    public async getAllTags(): Promise<TagInfo[]> {
        const SEP = '<<SEP>>';
        const FORMAT = `%(refname:short)${SEP}%(objectname:short)`;

        const output = await this.exec([
            'tag', `--format=${FORMAT}`,
        ]);

        if (!output) {
            return [];
        }

        return output.split('\n').map((line) => {
            const parts = line.split(SEP);
            return {
                name: parts[0],
                hash: parts[1],
            };
        });
    }

    public async getGraphLog(maxCount: number = 300, branches?: string[]): Promise<GraphCommitInfo[]> {
        const SEP = '<<SEP>>';
        const FORMAT = [
            '%H',   // full hash
            '%h',   // short hash
            '%s',   // subject
            '%an',  // author name
            '%ae',  // author email
            '%aI',  // author date ISO 8601
            '%P',   // parent hashes
            '%D',   // ref names
        ].join(SEP);

        const args = [
            'log',
            `--format=${FORMAT}`,
            `--max-count=${maxCount}`,
            '--topo-order',
        ];

        if (branches && branches.length > 0) {
            args.push(...branches);
        } else {
            args.push('--all');
        }

        const output = await this.exec(args);

        if (!output) {
            return [];
        }

        return output.split('\n').map((line) => {
            const parts = line.split(SEP);
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
    }

    public async getUserName(): Promise<string> {
        try {
            return (await this.exec(['config', 'user.name'])).trim();
        } catch {
            return '';
        }
    }

    public async getTrackingBranch(): Promise<{ remote: string; branch: string } | undefined> {
        try {
            const upstream = await this.exec(['rev-parse', '--abbrev-ref', '@{upstream}']);
            const [remote, ...branchParts] = upstream.split('/');
            return { remote, branch: branchParts.join('/') };
        } catch {
            return undefined;
        }
    }
}
