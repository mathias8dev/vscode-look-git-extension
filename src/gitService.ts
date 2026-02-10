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
        const shortHash = commitHash.substring(0, 7);
        const sedCommand = `sed -i 's/^pick ${shortHash}/drop ${shortHash}/'`;

        return this.exec(
            ['rebase', '-i', `${commitHash}~1`],
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
}
