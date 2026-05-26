import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitService } from '../../src/gitService';

export interface TempGitRepo {
    cwd: string;
    service: GitService;
    git(args: string[], options?: { env?: Record<string, string> }): string;
    gitTrim(args: string[], options?: { env?: Record<string, string> }): string;
    write(filePath: string, content: string): void;
    mkdir(dirPath: string): void;
    commit(message: string): string;
    cleanup(): void;
}

export function createTempGitRepo(): TempGitRepo {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'look-git-test-'));

    const git = (args: string[], options?: { env?: Record<string, string> }) => execFileSync(
        'git',
        args,
        {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                ...process.env,
                GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
                GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
                ...options?.env,
            },
        }
    );
    const gitTrim = (args: string[], options?: { env?: Record<string, string> }) => git(args, options).trim();

    const resolveInsideRepo = (relativePath: string): string => {
        const fullPath = path.resolve(cwd, relativePath);
        const relative = path.relative(cwd, fullPath);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Test path escapes temp repository: ${relativePath}`);
        }
        return fullPath;
    };

    try {
        git(['init', '-q']);
        git(['checkout', '-q', '-b', 'main']);
        git(['config', 'user.email', 'test@example.com']);
        git(['config', 'user.name', 'Test User']);
    } catch (error) {
        fs.rmSync(cwd, { recursive: true, force: true });
        throw error;
    }

    return {
        cwd,
        service: new GitService(cwd),
        git,
        gitTrim,
        write(filePath: string, content: string) {
            const fullPath = resolveInsideRepo(filePath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content);
        },
        mkdir(dirPath: string) {
            fs.mkdirSync(resolveInsideRepo(dirPath), { recursive: true });
        },
        commit(message: string) {
            git(['add', '-A']);
            git(['commit', '-q', '-m', message]);
            return gitTrim(['rev-parse', 'HEAD']);
        },
        cleanup() {
            fs.rmSync(cwd, { recursive: true, force: true });
        },
    };
}
